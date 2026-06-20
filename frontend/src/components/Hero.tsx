import { PageIntro } from "./ui";

type HeroProps = {
  title: string;
  subtitle: string;
  description: string;
};

export function Hero({ title, subtitle, description }: HeroProps) {
  return <PageIntro eyebrow={subtitle} title={title} description={description} />;
}
