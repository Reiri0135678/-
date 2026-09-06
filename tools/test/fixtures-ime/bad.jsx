export function Row({ onSave }) {
  return <input onKeyDown={e => { if (e.key === 'Enter') onSave(e.target.value); }} />;
}
