'use client';

import { useEffect, useState } from 'react';
import { IcoCheck } from './Icons';

const EVENT = 'rp-toast';
export function toast(message: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      setOn(true);
      clearTimeout(timer);
      timer = setTimeout(() => setOn(false), 3200);
    };
    window.addEventListener(EVENT, handler);
    return () => { window.removeEventListener(EVENT, handler); clearTimeout(timer); };
  }, []);

  return (
    <div className={`toast${on ? ' on' : ''}`} role="status" aria-live="polite">
      <IcoCheck s={15} />{msg}
    </div>
  );
}
