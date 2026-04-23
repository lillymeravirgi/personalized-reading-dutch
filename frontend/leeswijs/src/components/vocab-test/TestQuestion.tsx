// Placeholder for one multiple-choice vocabulary test item.
type Props = {
  word: string;
  options: string[];
  correctIndex: number;
  onAnswer: (isCorrect: boolean) => void;
};

export default function TestQuestion(_props: Props) {
  return <div>Test question component is not connected yet.</div>;
}
