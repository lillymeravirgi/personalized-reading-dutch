// Placeholder screen shown after the vocabulary test.
type Props = {
  correct: number;
  total: number;
  phase: "IMMEDIATE" | "DELAYED_24H";
};

export default function TestComplete(_props: Props) {
  return <div>Test completion summary is not connected yet.</div>;
}
