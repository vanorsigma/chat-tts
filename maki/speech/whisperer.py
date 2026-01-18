from pydantic_ai.providers.openrouter import OpenRouterProvider
import speech_recognition as sr
import io
from openai import OpenAI
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel

class Whisperer:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        self.ollama_model = OpenAIChatModel(
            # model_name='gemma3:12b-it-qat',
            # model_name='qwen3:8b',
            model_name=config['openrouter']['whisper_correction_model'],
            provider=OpenRouterProvider(api_key=config['openrouter']['openrouter_api_key'])
        )

        self.prompt_str = "Transcription:{transcription}\nChatters:{chatters}\nCorrected:{correction}"

        self.corrector_agent = Agent(
            self.ollama_model,
            output_type=str,
            system_prompt=(
                "Your goal is to correct utterances transcribed by an Automatic Speech Recognition Model. "
                "The context is usually for Twitch chat. "
                "Make the utterance make sense. "
                "If there are words that obviously don't make sense in the context, remove them. "
                "There might be words that when combined together references a chatter in the list provided by the user. "
                "Append a list of possible chatters in a list at the end of the sentence; it is ok to append an empty list instead [] "
                "Do not output anything else but the correction and the list. "
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
        return await self.correct_from_text(chatter_list, recognized)

    async def correct_from_text(self, chatter_list: list[str], recognized: str) -> str:
        result = await self.corrector_agent.run(self.prompt_str.format(
                transcription=recognized,
                chatters=chatter_list,
                correction=''
            ))

        corrected_result = result.output.strip().split('\n')[0]
        print('[RECOGNIZER] Corrected:', corrected_result)
        return corrected_result
