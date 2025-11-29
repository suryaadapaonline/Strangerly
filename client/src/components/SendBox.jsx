import React from 'react'

export default function SendBox({ onSend }){
  const [t, setT] = React.useState('')
  return (
    <div style={{display:'flex', gap:8}}>
      <input value={t} onChange={e=>setT(e.target.value)} placeholder="Type message..." />
      <button onClick={()=>{ if(t.trim()){ onSend(t.trim()); setT('') } }}>Send</button>
    </div>
  )
}