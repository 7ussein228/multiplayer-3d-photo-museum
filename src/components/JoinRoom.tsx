"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowIcon } from "./museum/Icons";

export default function JoinRoom() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(normalized)) {
      setError("Enter the 4–8 character code from your invitation.");
      return;
    }
    router.push(`/museum/${normalized}`);
  };
  return (
    <form className="join-room" onSubmit={submit}>
      <label htmlFor="room-code">HAVE AN INVITATION?</label>
      <div><input id="room-code" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }} placeholder="ROOM CODE" maxLength={8} /><button aria-label="Enter room"><ArrowIcon /></button></div>
      {error && <p>{error}</p>}
    </form>
  );
}
