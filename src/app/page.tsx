import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { OpportunityGrid } from "@/components/OpportunityGrid";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <OpportunityGrid />
      </main>
      <Footer />
    </>
  );
}
