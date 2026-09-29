// A tab page that isn't built yet: its heading, and which phase builds it.
export default function Placeholder({ title, phase, children }) {
  return (
    <>
      <div className="panel-head">
        <div className="panel-title"><h2>{title}</h2></div>
      </div>
      {children}
      <p className="empty">Arrives in Phase {phase}.</p>
    </>
  );
}
