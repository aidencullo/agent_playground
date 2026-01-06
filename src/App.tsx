import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <header className="App-header">
        <h1>React + S3 + CloudFront</h1>
        <p>Deployed with AWS S3 and CloudFront CDN</p>
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
        </div>
        <p className="info">
          Fast, cheap, and globally distributed static site hosting
        </p>
      </header>
    </div>
  )
}

export default App
