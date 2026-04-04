#!/usr/bin/env python3
"""
Herramienta TUI de práctica de frases en el terminal.
Uso: python practice.py [archivo.txt]
Requiere: pip install -r requirements.txt
"""
import asyncio
import csv
import hashlib
import os
import subprocess
import threading
from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional

from gtts import gTTS
from rich.align import Align
from rich.panel import Panel
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container
from textual.widgets import Footer, Static

COUNTDOWN_SECONDS = 5.0
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio_cache")
PANEL_WIDTH = 120
PANEL_HEIGHT = 12
CONTENT_WIDTH = PANEL_WIDTH - 14  # panel border (2) + padding (10) + margin (2)
BAR_WIDTH = CONTENT_WIDTH


@dataclass
class Phrase:
    espanol: str
    ingles: str


class PhraseState(Enum):
    INTRO_WAIT = auto()       # Estado 1: español + barra, sin audio
    AUDIO_WITH_BAR = auto()   # Estado 2: audio en ingles + barra
    AUDIO_WITH_TEXT = auto()  # Estado 3: audio + texto visible


def ensure_cache_dir() -> None:
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)


def get_audio_path(text: str) -> str:
    text_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{text_hash}.mp3")


def load_phrases(file_path: str) -> list[Phrase]:
    phrases: list[Phrase] = []
    with open(file_path, "r", encoding="utf-8") as file:
        reader = csv.reader(file, skipinitialspace=True)
        for row in reader:
            if len(row) >= 2:
                phrases.append(Phrase(row[0].strip(), row[1].strip()))
    return phrases


class LearningApp(App[None]):
    CSS = """
    Screen {
        align: center middle;
    }

    #layout {
        width: 100%;
        height: 100%;
        align: center middle;
    }

    #main {
        width: 100%;
        content-align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "quit", "Salir"),
        Binding("q", "quit", "Salir"),
        Binding("ctrl+c", "quit", "Salir"),
        Binding("space", "forward", "Siguiente estado"),
        Binding("right", "forward", "Siguiente estado"),
        Binding("left", "backward", "Estado anterior"),
        Binding("up", "prev_phrase", "Frase anterior"),
        Binding("down", "next_phrase", "Frase siguiente"),
        Binding("enter", "action_enter", "Acción"),
        Binding("t", "toggle_timer", "Timer"),
    ]

    def __init__(self, phrases: list[Phrase]) -> None:
        super().__init__()
        self.phrases = phrases
        self.current_index = 0
        self.state = PhraseState.INTRO_WAIT
        self.timer_val = COUNTDOWN_SECONDS
        self.audio_playing = False
        self.completed = False
        self.show_timer_bar = False
        self._audio_lock = threading.Lock()
        self._audio_process: Optional[subprocess.Popen] = None
        self._audio_session = 0

    def compose(self) -> ComposeResult:
        with Container(id="layout"):
            yield Static(id="main")
        yield Footer()

    def on_mount(self) -> None:
        self.set_interval(0.05, self.on_tick)
        self.start_phrase()

    def on_tick(self) -> None:
        if not self.phrases:
            return

        if self.show_timer_bar and self.state in (PhraseState.INTRO_WAIT, PhraseState.AUDIO_WITH_BAR):
            self.timer_val -= 0.05
            if self.timer_val <= 0:
                if self.state == PhraseState.INTRO_WAIT:
                    self.enter_state_audio_with_bar(play_audio_now=True)
                else:
                    self.enter_state_with_text(play_audio_now=True)

        self.refresh_main()

    def start_phrase(self) -> None:
        self.state = PhraseState.INTRO_WAIT
        self.timer_val = COUNTDOWN_SECONDS
        self.refresh_main()

    def play_current_audio(self) -> None:
        self.stop_current_audio()
        phrase = self.phrases[self.current_index]
        with self._audio_lock:
            self._audio_session += 1
            audio_session = self._audio_session
            self.audio_playing = True
        self.run_worker(self.play_audio_async(phrase.ingles, audio_session), exclusive=False)

    def stop_current_audio(self) -> None:
        with self._audio_lock:
            self._audio_session += 1
            process = self._audio_process
            self._audio_process = None
            self.audio_playing = False

        if process is None:
            return

        try:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=0.3)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass

    def enter_state_audio_with_bar(self, play_audio_now: bool) -> None:
        self.state = PhraseState.AUDIO_WITH_BAR
        self.timer_val = COUNTDOWN_SECONDS
        if play_audio_now:
            self.play_current_audio()
        self.refresh_main()

    def enter_state_with_text(self, play_audio_now: bool) -> None:
        self.state = PhraseState.AUDIO_WITH_TEXT
        self.timer_val = COUNTDOWN_SECONDS
        if play_audio_now:
            self.play_current_audio()
        self.refresh_main()

    def go_next_phrase(self) -> None:
        self.stop_current_audio()
        if self.current_index + 1 >= len(self.phrases):
            self.completed = True
            self.exit()
            return

        self.current_index += 1
        self.audio_playing = False
        self.start_phrase()

    def build_main_panel(self):
        phrase = self.phrases[self.current_index]
        show_ingles = self.state == PhraseState.AUDIO_WITH_TEXT
        title = f"[bold]{self.current_index + 1}/{len(self.phrases)}[/bold]"

        content = Text()
        content.append(f"\n🇪🇸  {phrase.espanol}\n", style="bold white")

        if show_ingles:
            content.append(f"\n🇺🇸  {phrase.ingles}\n", style="bold green")
        else:
            content.append("\n🇺🇸  ....\n", style="dim")

        if self.show_timer_bar and self.state in (PhraseState.INTRO_WAIT, PhraseState.AUDIO_WITH_BAR):
            progress = max(0.0, min(1.0, self.timer_val / COUNTDOWN_SECONDS))
            filled = int(progress * BAR_WIDTH)
            bar = "█" * filled + "░" * (BAR_WIDTH - filled)
            content.append(f"\n{bar}\n", style="magenta")
        else:
            content.append("\n" + " " * BAR_WIDTH + "\n")

        if self.state == PhraseState.INTRO_WAIT:
            content.append("\n[Enter] Continue\n", style="dim")
        elif self.state == PhraseState.AUDIO_WITH_BAR:
            content.append("\n[Enter] Continue [Space] Text\n", style="dim")
        else:
            content.append("\n[Enter] Continue [Space] Repeat\n", style="dim")

        return Align.center(
            Panel(
                Align.center(content),
                border_style="magenta",
                padding=(1, 5),
                title=title,
                width=PANEL_WIDTH,
                height=PANEL_HEIGHT,
                expand=False,
            ),
            vertical="middle",
        )

    def refresh_main(self) -> None:
        self.query_one("#main", Static).update(self.build_main_panel())

    async def play_audio_async(self, text: str, audio_session: int) -> None:
        try:
            await asyncio.to_thread(self.play_audio_blocking, text, audio_session)
        finally:
            with self._audio_lock:
                if audio_session == self._audio_session:
                    self.audio_playing = False
                    self._audio_process = None

    def play_audio_blocking(self, text: str, audio_session: int) -> None:
        ensure_cache_dir()
        filename = get_audio_path(text)
        if not os.path.exists(filename):
            tts = gTTS(text=text, lang="en")
            tts.save(filename)

        if os.name == "posix":
            process = subprocess.Popen(["afplay", filename], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with self._audio_lock:
                if audio_session != self._audio_session:
                    try:
                        process.terminate()
                    except Exception:
                        pass
                    return
                self._audio_process = process
            process.wait()
        else:
            subprocess.run(["start", "/min", filename], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)

    def go_prev_phrase(self) -> None:
        self.stop_current_audio()
        if self.current_index > 0:
            self.current_index -= 1
        self.audio_playing = False
        self.start_phrase()

    def enter_state_intro_wait(self) -> None:
        self.stop_current_audio()
        self.state = PhraseState.INTRO_WAIT
        self.timer_val = COUNTDOWN_SECONDS
        self.refresh_main()

    def action_quit(self) -> None:
        self.stop_current_audio()
        self.exit()

    def action_forward(self) -> None:
        if self.state == PhraseState.INTRO_WAIT:
            self.enter_state_audio_with_bar(play_audio_now=True)
        elif self.state == PhraseState.AUDIO_WITH_BAR:
            self.enter_state_with_text(play_audio_now=True)
        elif self.state == PhraseState.AUDIO_WITH_TEXT:
            self.play_current_audio()

    def action_backward(self) -> None:
        if self.state == PhraseState.AUDIO_WITH_TEXT:
            self.enter_state_audio_with_bar(play_audio_now=False)
        elif self.state == PhraseState.AUDIO_WITH_BAR:
            self.enter_state_intro_wait()

    def action_prev_phrase(self) -> None:
        self.go_prev_phrase()

    def action_next_phrase(self) -> None:
        self.go_next_phrase()

    def action_action_enter(self) -> None:
        if self.state == PhraseState.INTRO_WAIT:
            self.enter_state_audio_with_bar(play_audio_now=True)
        else:
            self.go_next_phrase()

    def action_toggle_timer(self) -> None:
        self.show_timer_bar = not self.show_timer_bar
        self.timer_val = COUNTDOWN_SECONDS
        self.refresh_main()


def start_learning(file_path: str) -> None:
    if not os.path.exists(file_path):
        print(f"Error: El archivo '{file_path}' no existe.")
        return

    try:
        phrases = load_phrases(file_path)
    except Exception as error:
        print(f"Error leyendo el archivo: {error}")
        return

    if not phrases:
        print("No hay frases válidas para practicar.")
        return

    app = LearningApp(phrases)
    app.run()

    if app.completed:
        print("\n¡Sesión terminada! Good job! 👏")


if __name__ == "__main__":
    import sys
    file_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "packs", "daily-life-1", "phrases.txt")
    start_learning(file_path)
