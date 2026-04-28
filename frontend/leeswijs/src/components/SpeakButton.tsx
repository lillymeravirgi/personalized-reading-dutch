import { useState } from "react";
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

  function speak(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!text.trim() || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "nl-NL";
    utterance.rate = 0.86;

    const dutchVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("nl"));
    if (dutchVoice) utterance.voice = dutchVoice;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center justify-center rounded-lg border border-black/8",
        "bg-white text-primary shadow-sm shadow-black/5 transition-colors",
        "hover:border-primary/30 hover:bg-primary/[0.04]",
        speaking ? "ring-2 ring-primary/25" : "",
        className,
      ].join(" ")}
    >
      <Volume2 size={size} strokeWidth={2.2} />
    </button>
  );
}
