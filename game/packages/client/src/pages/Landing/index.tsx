export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary text-white">
      <h1 className="mb-2 text-4xl font-bold">盗梦都市</h1>
      <p className="mb-8 text-gray-400">Inception City Online</p>
      <div className="flex gap-4">
        <a
          href="/local"
          className="rounded-lg bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover"
        >
          单机练习
        </a>
        <a
          href="/lobby"
          className="rounded-lg border border-white/20 px-6 py-3 font-bold text-white hover:bg-white/10"
        >
          多人房间
        </a>
      </div>
    </div>
  );
}
