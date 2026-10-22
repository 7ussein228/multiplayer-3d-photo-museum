"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#191b18",
          color: "#f2efe6",
          fontFamily: "Georgia, 'Times New Roman', serif",
          margin: 0,
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p style={{ letterSpacing: "0.28em", fontSize: "0.7rem", opacity: 0.6 }}>
            STILL — PRIVATE MUSEUM
          </p>
          <h1 style={{ fontSize: "2rem", fontWeight: 400, margin: "1rem 0" }}>
            This room could not open.
          </h1>
          <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
            The museum needs its database to be reachable. If you are the curator, check the
            deployment environment for <code>DATABASE_URL</code> and make sure the tables exist.
          </p>
          {error.digest ? (
            <p style={{ opacity: 0.45, fontSize: "0.75rem", marginTop: "1.5rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              background: "transparent",
              border: "1px solid rgba(242,239,230,0.4)",
              color: "#f2efe6",
              padding: "0.7rem 1.6rem",
              letterSpacing: "0.16em",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            TRY AGAIN
          </button>
        </div>
      </body>
    </html>
  );
}
