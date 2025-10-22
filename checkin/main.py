"""
Check-in script. Should start at the beginning.
"""

import asyncio
import websockets
import pydantic
import whisper
import speech_recognition as sr
import numpy as np
import torch
import string
import nltk
import re

from datetime import datetime, timedelta
from queue import Queue
from openai import AsyncOpenAI
from interfaces import WSRequest, WSResponse, WSClearResponse

BASE_URL = "http://127.0.0.1:11434/v1"
PROMPT_STR = """You will be given a username. Assuming that you are a catmaid programmer called VanorSigma, come up with an embarrasing and short response (< 20 words) to greet the user into the stream."""
WS_SENDER_URL = "ws://127.0.0.1:3001/senders"
WS_RECEIVERS_URL = "ws://127.0.0.1:3001/receivers"
MODEL_NAME = "gemma3:12b-it-qat"
# MODEL_NAME = "gemma3:4b"
MIC_NAME = "pipewire"  # change to pulse to use pulse

checkins_mutex = asyncio.Lock()
checkins_locked = False  # locked after at least one checkin is cleared
checkins_condition = asyncio.Condition(checkins_mutex)
# checkins = [WSResponse(username='threetwoonetwothree', message='Hey there, threetwoonetwothree! Welcome to the stream! Got my compiler purring and ready. Glad you could make it!')]
checkins = []
client = AsyncOpenAI(api_key="sybau", base_url=BASE_URL)


async def ask_ai(username: str) -> str:
    response = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": PROMPT_STR},
            {"role": "user", "content": username},
        ],
        max_tokens=100,
    )
    return response.choices[0].message.content


async def handler(
    recv: websockets.ClientConnection, sender: websockets.ClientConnection
) -> None:
    async for message in recv:
        async with checkins_condition:
            if checkins_locked:
                return

            try:
                request = WSRequest.model_validate_json(message)
                username: str = request.username
                ai_response = await ask_ai(username)
                response = WSResponse(username=username, message=ai_response)
                checkins.append(response)
                await sender.send(response.model_dump_json())
                checkins_condition.notify_all()
            except pydantic.ValidationError:
                print("Validation Error, continuing anyway")
                continue


async def voice_handler(sender: websockets.ClientConnection) -> None:
    global checkins_locked

    phrase_time = None
    data_queue = Queue()
    phrase_bytes = bytes()
    recorder = sr.Recognizer()
    record_timeout = 15
    phrase_timeout = 3
    transcription = [""]
    source = None

    model = whisper.load_model("small")

    # conditional wait checkins_mutex to check checkins_locked, only proceed if the condition
    # we are waiting for (which is checksin_locked) is done
    while True:
        async with checkins_condition:
            await checkins_condition.wait()

            if len(checkins) > 0:
                break

    source = sr.Microphone(sample_rate=16000)
    # for index, name in enumerate(sr.Microphone.list_microphone_names()):
    #     if MIC_NAME in name:
    #         source = sr.Microphone(sample_rate=16000, device_index=index)
    #         break

    if not source:
        print("no mic found")
        return

    with source:
        recorder.adjust_for_ambient_noise(source)

    def record_callback(_, audio: sr.AudioData) -> None:
        """
        Threaded callback function to receive audio data when recordings finish.
        audio: An AudioData containing the recorded bytes.
        """
        # Grab the raw bytes and push it into the thread safe queue.
        data = audio.get_raw_data()
        data_queue.put(data)

    recorder.listen_in_background(
        source, record_callback, phrase_time_limit=record_timeout
    )

    while len(checkins) > 0:
        current_checkin = checkins[0]
        now = datetime.utcnow()
        if not data_queue.empty():
            phrase_complete = False
            if phrase_time and now - phrase_time > timedelta(seconds=phrase_timeout):
                phrase_bytes = bytes()
                phrase_complete = True
            phrase_time = now

            audio_data = b"".join(data_queue.queue)
            data_queue.queue.clear()

            phrase_bytes += audio_data

            audio_np = (
                np.frombuffer(phrase_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            )

            result = model.transcribe(audio_np, fp16=torch.cuda.is_available())
            text = result["text"].strip()

            if phrase_complete:
                transcription.append(text)
            else:
                transcription[-1] = text

            line = re.sub(r"[^a-zA-Z0-9 ]", "", transcription[-1].lower()).split(" ")
            reference = re.sub(
                r"[^a-zA-Z0-9 ]",
                "",
                current_checkin.message.lower().replace(current_checkin.username, ""),
            ).split(" ")
            print(line, reference)
            score = nltk.translate.bleu_score.sentence_bleu(
                [reference], line, weights=(1, 0, 0, 0)
            )
            print(line, score)

            if score >= 0.5:
                async with checkins_condition:
                    checkins.pop(0)
                    checkins_locked = True
                    clear_response = WSClearResponse(username=current_checkin.username)
                    await sender.send(clear_response.model_dump_json())
        else:
            await asyncio.sleep(0.25)


async def main():
    async with websockets.connect(WS_RECEIVERS_URL) as websocket_recv:
        async with websockets.connect(WS_SENDER_URL) as websocket_sender:
            async with asyncio.TaskGroup() as group:
                group.create_task(handler(websocket_recv, websocket_sender))
                group.create_task(voice_handler(websocket_sender))


if __name__ == "__main__":
    print(sr.Microphone.list_microphone_names())
    asyncio.run(main())
