import { QuizRunner } from "./QuizRunner";

export default function QuizTokenPage({ params }: { params: { token: string } }) {
  return <QuizRunner token={params.token} />;
}
