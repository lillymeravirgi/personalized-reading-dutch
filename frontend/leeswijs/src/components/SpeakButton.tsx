import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

type Props = {
  text: string;
  label?: string;
  className?: string;
  size?: number;
};

export default function SpeakButton({
  text,
  label = "Play pronunciation",
  className = "",
  size = 16,
}: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const clearUnavailable = () => setVoiceUnavailable(false);
    window.speechSynthesis.addEventListener("voiceschanged", clearUnavailable);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", clearUnavailable);
    };
  }, []);

  function getNetherlandsDutchVoice() {
    return window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase() === "nl-nl");
  }

  function speak(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!text.trim() || !("speechSynthesis" in window)) return;

    const dutchVoice = getNetherlandsDutchVoice();
    if (!dutchVoice) {
      setVoiceUnavailable(true);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "nl-NL";
    utterance.rate = 0.86;
    utterance.voice = dutchVoice;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setVoiceUnavailable(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  const buttonLabel = voiceUnavailable
    ? "Netherlands Dutch voice unavailable on this device"
    : label;

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={buttonLabel}
      title={buttonLabel}
      className={[
        "inline-flex items-center justify-center rounded-lg border border-black/8",
        "bg-white text-primary shadow-sm shadow-black/5 transition-colors",
        "hover:border-primary/30 hover:bg-primary/[0.04]",
        speaking ? "ring-2 ring-primary/25" : "",
        voiceUnavailable ? "opacity-60" : "",
        className,
      ].join(" ")}
    >
      <Volume2 size={size} strokeWidth={2.2} />
    </button>
  );
}
