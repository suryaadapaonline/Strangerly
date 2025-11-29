import { io } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_WS_URL || import.meta.env.REACT_APP_WS_URL || 'http://localhost:3000'
const socket = io(WS_URL, { autoConnect: true })
export default socket