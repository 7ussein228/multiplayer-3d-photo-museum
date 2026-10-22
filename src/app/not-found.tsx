import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span>STILL / 404</span>
      <h1>This room is not on the floor plan.</h1>
      <p>The invitation may have a typo, or the private museum no longer exists.</p>
      <Link href="/">Return to the entrance</Link>
    </main>
  );
}
