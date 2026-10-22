import Link from "next/link";
import JoinRoom from "@/components/JoinRoom";
import { ArrowIcon, ChatIcon, PlayIcon, SeatIcon, UsersIcon } from "@/components/museum/Icons";
import { ensureDemoGallery } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDemoGallery();
  return (
    <main className="home-page">
      <header className="home-nav">
        <Link href="/" className="brand-link">STILL <span>PRIVATE MUSEUM</span></Link>
        <nav><a href="#experience">The experience</a><a href="#how">How it works</a><Link href="/create">Create a museum <ArrowIcon size={15} /></Link></nav>
      </header>

      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow"><i /> A MULTIPLAYER MUSEUM FOR YOUR MEMORIES</p>
          <h1>Some moments<br />deserve <em>a room.</em></h1>
          <p className="hero-description">Your photographs, framed and lit in a quiet museum. Walk the halls with your favourite people, from wherever you are.</p>
          <div className="hero-actions"><Link href="/create" className="primary-link">Create your museum <ArrowIcon /></Link><Link href="/museum/STILL" className="secondary-link">Walk the demo</Link></div>
          <div className="hero-spec"><span>6–45 PHOTOGRAPHS</span><i /><span>UP TO 4 GUESTS</span><i /><span>YOUR WORDS & FILM</span></div>
        </div>
        <div className="hero-visual">
          <img src="/images/museum-still.jpg" alt="A quiet, warmly lit museum with framed photographs and benches" />
          <div className="hero-image-shade" />
          <div className="hero-caption"><span>THE LIGHT WE KEPT</span><p>A private collection by Mara & Elian</p></div>
          <Link href="/museum/STILL" className="hero-enter"><span>ENTER<br />THE DEMO</span><ArrowIcon /></Link>
          <div className="hero-frame-label"><i /> THE CENTREPIECE <span>01 / 10</span></div>
        </div>
        <div className="scroll-note"><span /> SCROLL TO WANDER</div>
      </section>

      <section className="experience-section" id="experience">
        <div className="experience-title"><p>NOT A FEED. A PLACE.</p><h2>Be together.<br /><em>Take your time.</em></h2></div>
        <div className="experience-copy"><p>STILL turns the photographs you love into a place you can actually visit. No feeds to scroll, no comments to perform for. Just a room, the people you invite, and whatever the photographs bring back.</p><Link href="/create">Begin your collection <ArrowIcon size={16} /></Link></div>
        <div className="feature-grid">
          <article><UsersIcon size={25} /><span>01 / TOGETHER</span><h3>Every guest,<br />their own device.</h3><p>Share one private invitation. Up to four people can walk, stop, find each other and talk in the same room.</p></article>
          <article><SeatIcon size={25} /><span>02 / UNHURRIED</span><h3>A bench when<br />you need one.</h3><p>Sit before the centrepiece or beside a friend. Your guest sits too, so everyone shares the same small moment.</p></article>
          <article><PlayIcon size={25} /><span>03 / MOVING IMAGE</span><h3>Your film,<br />on the gallery screen.</h3><p>Add a short film and gather in the screening room. Playback stays in sync for everyone watching.</p></article>
          <article><ChatIcon size={25} /><span>04 / CONVERSATION</span><h3>Names, presence<br />and quiet words.</h3><p>See who is inside and where they wander. Send a thought to the room without leaving the collection.</p></article>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="how-image"><img src="/images/museum-still.jpg" alt="Museum collection interior" /><span>YOUR FIRST PHOTOGRAPH<br />ALWAYS THE CENTREPIECE</span></div>
        <div className="how-steps"><p>MADE IN THREE QUIET STEPS</p><h2>From your camera roll<br />to a room of your own.</h2>
          <article><span>01</span><div><h3>Choose what belongs.</h3><p>Add six to forty-five photographs. Reorder them and choose the one that deserves the far wall.</p></div></article>
          <article><span>02</span><div><h3>Leave a few words.</h3><p>Name the collection and write a dedication. It hangs at the entrance, and greets every guest.</p></div></article>
          <article><span>03</span><div><h3>Invite your people.</h3><p>Add a short film if you like, then share the room code. No accounts, no audience, just your guests.</p></div></article>
          <Link href="/create" className="primary-link">Make something lasting <ArrowIcon /></Link>
        </div>
      </section>

      <section className="invitation-section">
        <div><p>THE DOOR IS OPEN</p><h2>Come and see<br /><em>how it feels.</em></h2></div>
        <div className="invitation-actions"><Link href="/museum/STILL" className="primary-link">Enter the demo museum <ArrowIcon /></Link><span>or</span><JoinRoom /></div>
      </section>
      <footer className="home-footer"><Link href="/" className="brand-link">STILL</Link><p>A quiet place for loud memories.</p><span>PRIVATE BY INVITATION · BUILT FOR PRESENCE</span></footer>
    </main>
  );
}
