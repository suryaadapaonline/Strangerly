import React, { useEffect, useState } from 'react'
import socket from './socket'
import SendBox from './components/SendBox'

export default function App(){
  const [online, setOnline] = useState([])
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])

  useEffect(()=>{
    socket.on('connect', ()=> console.log('ws connected', socket.id))
    socket.on('online:list', (users) => setOnline(users))
    socket.on('random:matched', ({ room }) => { setRoom(room); setMsgs([]) })
    socket.on('random:queued', ()=> alert('Queued for random chat - waiting for a partner'))
    socket.on('chat:msg', (m) => setMsgs(prev=>[...prev,m]))

    socket.emit('auth', { id: null, gender: 'any', displayName: 'Anon' })

    return ()=>{ socket.off() }
  }, [])

  const startRandom = ()=> socket.emit('random:find', { genderPref: 'any' })
  const sendMsg = (text)=> socket.emit('chat:msg', { room, text })

  return (
    <div style={{maxWidth:900, margin:'20px auto', fontFamily:'system-ui, sans-serif'}}>
      <h1>Strangerly — MVP</h1>
      <div style={{display:'flex', gap:20}}>
        <div style={{flex:1}}>
          <button onClick={startRandom}>Start Random Chat</button>
          <h3>Online Users</h3>
          <ul>{online.map(u => <li key={u.id}>{u.displayName} — {u.gender} — {u.status}</li>)}</ul>
        </div>
        <div style={{flex:2}}>
          <h3>Chat {room || '(not connected)'}</h3>
          <div style={{minHeight:200, border:'1px solid #ddd', padding:10, marginBottom:8, overflow:'auto'}}>
            {msgs.map((m,i)=>(<div key={i}><b>{m.userId}</b>: {m.text}</div>))}
          </div>
          <SendBox onSend={sendMsg} />
        </div>
      </div>
    </div>
  )
}