import React, { useEffect, useState, useRef } from 'react'
import socket from './socket'
import SendBox from './components/SendBox'
import OnlineList from './components/OnlineList'

export default function App(){
  const [online, setOnline] = useState([])
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [connecting, setConnecting] = useState(false)
  const containerRef = useRef(null)

  useEffect(()=>{
    socket.on('connect', ()=> console.log('ws connected', socket.id))

    socket.on('online:list', (users) => setOnline(users || []))

    socket.on('random:matched', ({ room }) => {
      setRoom(room)
      setMsgs([]) // clear previous messages when new match arrives
      setConnecting(false)
    })

    socket.on('random:queued', ()=> {
      setConnecting(true)
      // optional tiny UI note
    })

    socket.on('chat:msg', (m) => setMsgs(prev => [...prev, m]))

    socket.on('chat:history', (history) => setMsgs(history || []))

    socket.on('rate:limit', ({ retryAfterMs }) => {
      const s = Math.ceil((retryAfterMs || 0) / 1000)
      alert(`You are sending messages too fast. Wait ${s} second(s).`)
    })

    socket.on('partner:left', ({ userId }) => {
      // partner left (skip or disconnect)
      if (room) alert('Your partner left the chat.')
      setRoom(null)
      setMsgs([])
      setConnecting(false)
    })

    socket.emit('auth', { id: null, gender: 'any', displayName: 'Anon' })

    return ()=>{ socket.off() }
  }, [room])

  useEffect(()=>{
    if(containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [msgs])

  const startRandom = ()=> {
    setConnecting(true)
    socket.emit('random:find', { genderPref: 'any' })
  }

  const skipRandom = ()=> {
    if(!room){
      // if not in a room, start a find
      socket.emit('random:find', { genderPref: 'any' })
      setConnecting(true)
      return
    }
    // tell server to skip and find new partner
    socket.emit('random:skip')
    // reset local room/messages until new match
    setRoom(null)
    setMsgs([])
    setConnecting(true)
  }

  const leaveRoom = ()=> {
    if(room){
      socket.emit('leave:room', { room })
      setRoom(null)
      setMsgs([])
      setConnecting(false)
    }
  }

  const sendMsg = (text)=>{
    if(!room){
      alert('Not connected to a chat room yet')
      return
    }
    socket.emit('chat:msg', { room, text })
  }

  return (
    <div className="app-root" style={{maxWidth:1000, margin:'20px auto', fontFamily:'system-ui, sans-serif'}}>
      <h1>Strangerly — MVP</h1>
      <div style={{display:'flex', gap:20}}>
        <div style={{flex:1}}>
          <div style={{marginBottom:12}}>
            {!room ? (
              <button onClick={startRandom} disabled={connecting}>{connecting ? 'Finding...' : 'Start Random Chat'}</button>
            ) : (
              <>
                <button onClick={skipRandom}>Skip</button>
                <button onClick={leaveRoom} style={{marginLeft:8}}>Leave</button>
              </>
            )}
          </div>

          <OnlineList users={online} />
        </div>

        <div style={{flex:2}}>
          <h3>Chat {room || '(not connected)'}</h3>
          <div ref={containerRef} style={{minHeight:300, border:'1px solid #ddd', padding:10, marginBottom:8, overflow:'auto', background:'#fff'}}>
            {msgs.length === 0 && <div style={{color:'#666'}}>No messages yet</div>}
            {msgs.map((m,i)=>(
              <div key={`${m.userId || 'u'}-${m.ts || i}-${i}`} style={{marginBottom:8}}>
                <b>{m.userId === socket.id ? 'You' : (m.userId || 'Anon')}</b>: {m.text}
                <div style={{fontSize:11, color:'#888'}}>{m.ts ? new Date(m.ts).toLocaleTimeString() : ''}</div>
              </div>
            ))}
          </div>
          <SendBox onSend={sendMsg} />
        </div>
      </div>
    </div>
  )
}
