import React from 'react'

const API_BASE = import.meta.env.VITE_WS_URL // backend URL (Render)

export default function OnlineList({ users=[] }){
  
  async function reportUser(reportedId){
    const reason = window.prompt('Report reason (optional):')
    if(reason === null) return // canceled

    try{
      const resp = await fetch(`${API_BASE}/report`, {
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: null,
          reportedId,
          roomId: null,
          reason
        })
      })

      const j = await resp.json()
      if(j.ok) alert('Report submitted. Thanks.')
      else alert('Report failed.')
      
    }catch(err){
      console.error('report error', err)
      alert('Report failed (network).')
    }
  }

  return (
    <div className="online-list">
      <h4>Online ({users.length})</h4>
      <ul>
        {users.map(u=> (
          <li key={u.id || Math.random()} className={`online-item ${u.gender || ''}`}>
            <span className="name">{u.displayName || u.id || 'Anon'}</span>
            <span className="status"> — {u.status || ''}</span>

            <button
              style={{marginLeft:8}}
              onClick={()=>reportUser(u.id)}
            >
              Report
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
