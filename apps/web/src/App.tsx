import { useEffect, useMemo, useState } from 'react'
import './App.css'

type MetricsResponse = {
  deviceId: string
  region: string
  fetchedAt: string
  metrics: {
    current: number | null
    voltage: number | null
    power: number | null
    energy: number | null
    soc: number | null
  }
  status: Array<{ code: string; value: unknown }>
}

function App() {
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const rows = useMemo(() => {
    const m = data?.metrics
    if (!m) return []
    return [
      { label: 'Ток', value: m.current },
      { label: 'Напряжение', value: m.voltage },
      { label: 'Мощность', value: m.power },
      { label: 'Энергия', value: m.energy },
      { label: 'SoC', value: m.soc },
    ]
  }, [data])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tuya/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as MetricsResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <>
      <h1>Tuya DC шунт</h1>

      <div className="card">
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Обновляю…' : 'Обновить'}
        </button>
        <p style={{ marginTop: 12, opacity: 0.8 }}>
          {data ? (
            <>
              device: <code>{data.deviceId}</code> • region: <code>{data.region}</code> •{' '}
              {new Date(data.fetchedAt).toLocaleString()}
            </>
          ) : (
            <>Нет данных</>
          )}
        </p>
        {error ? (
          <p style={{ marginTop: 12, color: '#ff6b6b' }}>
            Ошибка: <code>{error}</code>
          </p>
        ) : null}
      </div>

      <div className="card" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Метрики</h2>
        {rows.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((r) => (
              <li key={r.label}>
                <b>{r.label}:</b> <code>{r.value ?? '—'}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p>—</p>
        )}
      </div>
    </>
  )
}

export default App
