"use client";

import { useEffect, useRef, useState } from "react";

// Espaço de foto da home: mostra a hachura com a orientação do enquadramento até o arquivo existir.
// Para trocar, basta colocar a foto em public/home/ com o nome esperado (ex.: marca.jpg).
export default function FotoHome({
  src,
  alt,
  rotulo,
  className = "",
}: {
  src: string;
  alt: string;
  rotulo?: string;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // A imagem pode falhar antes da hidratação (onError perdido): confere ao montar.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalhou(true);
  }, []);

  return (
    <div className={`foto-home ${className}`}>
      <div className="foto-home-vazio" aria-hidden="true">
        {rotulo && <span>{rotulo}</span>}
      </div>
      {!falhou && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} className="foto-home-img" src={src} alt={alt} onError={() => setFalhou(true)} />
      )}
    </div>
  );
}
