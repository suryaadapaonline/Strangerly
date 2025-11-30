import React, { useEffect, useState } from 'react'
import socket from './socket'
import SendBox from './components/SendBox'
import OnlineList from './components/OnlineList'

export default function App(){
  const [online, setOnline] = useState([])
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])

  useEffect(()=>{
    socket.on('connect', ()=> console.log('ws connected', socket.id))

    socket.on('online:list', (users) => {
      setOnline(users || [])
    })

    socket.on('random:matched', ({ room }) => {
      setRoom(room)
      setMsgs([]) // clear previous messages when new match arrives
    })

    socket.on('random:queued', ()=> {
      alert('Queued for random chat - waiting for a partner')
    })

    // incoming single message (live)
    socket.on('chat:msg', (m) => {
      setMsgs(prev => [...prev, m])
    })

    // load chat history when server sends it
    socket.on('chat:history', (history) => {
      // history expected: array of { userId, text, ts }
      setMsgs(history || [])
    })

    // handle server-side rate limit notification
    socket.on('rate:limit', ({ retryAfterMs }) => {
      const s = Math.ceil((retryAfterMs || 0) / 1000)
      alert(`You are sending messages too fast. Wait ${s} second(s).`)
    })

    // anonymous auth
    socket.emit('auth', { id: null, gender: 'any', displayName: 'Anon' })

    return ()=>{ socket.off() }
  }, [])

  const startRandom = ()=> socket.emit('random:find', { genderPref: 'any' })

  const sendMsg = (text)=>{
    if(!room){
      alert('Not connected to a chat room yet')
      return
    }
    // optimistic UI add (so user sees message instantly)
    const localMsg = { userId: socket.id, text, ts: Date.now() }
    setMsgs(prev => [...prev, localMsg])

    // send to server
    socket.emit('chat:msg', { room, text })
  }

  return (
    <div style={{maxWidth:900, margin:'20px auto', fontFamily:'system-ui, sans-serif'}}>
      <h1>Strangerly — MVP</h1>
      <div style={{display:'flex', gap:20}}>
        <div style={{flex:1}}>
          <button onClick={startRandom}>Start Random Chat</button>
          <OnlineList users={online} />
        </div>
        <div style={{flex:2}}>
          <h3>Chat {room || '(not connected)'}</h3>
          <div style={{minHeight:200, border:'1px solid #ddd', padding:10, marginBottom:8, overflow:'auto'}}>
            {msgs.length === 0 && <div style={{color:'#666'}}>No messages yet</div>}
            {msgs.map((m,i)=>(
              <div key={`${m.userId || 'u'}-${m.ts || i}-${i}`}>
                <b>{m.userId === socket.id ? 'You' : (m.userId || 'Anon')}</b>: {m.text}
              </div>
            ))}
          </div>
          <SendBox onSend={sendMsg} />
        </div>
      </div>
    </div>
  )
}
