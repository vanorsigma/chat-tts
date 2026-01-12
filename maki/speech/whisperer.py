import asyncio
from pydantic_ai.providers.openrouter import OpenRouterProvider
import whisper
import speech_recognition as sr
import io
from openai import OpenAI
from pydantic_ai import Agent, ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider

class Whisperer:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        self.ollama_model = OpenAIChatModel(
            # model_name='gemma3:12b-it-qat',
            # model_name='qwen3:8b',
            model_name=config['openrouter']['whisper_correction_model'],
            provider=OpenRouterProvider(api_key=config['openrouter']['openrouter_api_key'])
        )

        self.prompt_str = "Transcription:{transcription}\nChatters:{chatters}\nCorrected:{correction}"

        # a bunch of known words that **will** not be correctly recognized, but hopefully
        # the corrector will figure it out
        known_corrections = [
            "If subject of a sentence sounds similar to Spookiest Spooks, correct it to SpookiestSpooks instead",
            "If subject of a sentence sounds similar to My Ego and/or the context is related to an aritst, correct it to mayoigo instead",
            "If subject of a sentence sounds similar to bgar/bika, correct it to sqbika instead"
        ]

        self.corrector_agent = Agent(
            self.ollama_model,
            output_type=str,
            system_prompt=(
                "Your goal is to correct utterances transcribed by an Automatic Speech Recognition Model. "
                "Make the utterance make sense to another language model. "
                "If there are words that obviously don't make sense in the context, remove them.\n"
                "There might be words that when combined together addresses a chatter in the list provided by the user. "
                "If so, correct those words to those chatters. \n"
                "Do not output anything else but the correction. "
                "Here are some rough correction rules to help you: [" + ','.join(known_corrections) + "]"
                "\n" +
                self.prompt_str.format(
                    transcription='mah key, can you write me a hell-',
                    chatters=['vanorsigma'],
                    correction='Maki, can you write me a hello world script'
                )
            ),
        )

        # self.subject_agent = Agent(
        #     self.ollama_model,
        #     output_type=str,
        #     system_prompt=(
        #         "Your goal is to extract the subject of the sentence trascribed by an Automatic Speech Recognition Model. "
        #         "Output an array in this format [subject_1, subject_2]. If there are none, output []. Output quickly."
        #         "\n" +
        #         self.subject_prompt_str.format(
        #             transcription='Myo Gore, the artist, is a really good artist.',
        #             subjects='[\"Myo Gore\"]'
        #         )
        #     ),
        # )

        self.whisper_client = OpenAI(
            base_url="http://localhost:5000/v1",
            api_key="abooba"
        )

        self.r = sr.Recognizer()

    async def correcting_whisperer_get_utterance(self, chatter_list: list[str]) -> str:
        with sr.Microphone() as source:
            print("[RECOGNIZER] Ready for input!")
            audio = self.r.listen(source)

        wav_data = io.BytesIO(audio.get_wav_data())
        wav_data.name = "audio.wav"

        recognized = self.whisper_client.audio.transcriptions.create(
            model="whisper-1",
            language='en',
            file=wav_data
        ).text
        print('[RECOGNIZER] Recognized:', recognized)

        result = await self.corrector_agent.run(self.prompt_str.format(
                transcription=recognized,
                chatters=chatter_list,
                correction=''
            ))

        corrected_result = result.output.strip().split('\n')[0]
        print('[RECOGNIZER] Corrected:', corrected_result)
        return corrected_result
