import { Logo } from '../components/Logo';

export default function SetupNeededPage() {
  return (
    <div className="full-center">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="stack" style={{ alignItems: 'center', marginBottom: 16 }}>
          <Logo height={88} />
        </div>
        <h1 className="title-md">Firebase isn't configured yet</h1>
        <p className="muted">
          Copy <code>.env.example</code> to <code>.env.local</code> in the project root and fill in your
          Firebase project's values (Project settings → General → Your apps → SDK setup and configuration),
          including the Realtime Database URL. Then restart the dev server.
        </p>
      </div>
    </div>
  );
}
