import { useEffect, useMemo, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import './App.css'

Chart.register(...registerables)

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

type AggregatePoint = {
  bucket: string
  value: number | null
}

type TodayPoint = {
  ts: string
  value: number | null
}

function App() {
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [aggregate, setAggregate] = useState<AggregatePoint[]>([])
  const [today, setToday] = useState<TodayPoint[]>([])
  const [granularity, setGranularity] = useState<'day' | 'month' | 'year'>('day')

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

  async function callSync(path: string, label: string) {
    try {
      setSyncStatus(`${label}…`)
      const res = await fetch(path, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setSyncStatus(`${label}: ok (${JSON.stringify(json)})`)
      // после синхронизации перезагрузим агрегаты
      void loadCharts()
    } catch (e) {
      setSyncStatus(
        `${label}: ошибка ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  async function loadCharts() {
    try {
      const aggRes = await fetch(
        `/api/metrics/aggregate?metric=power&granularity=${granularity}`,
      )
      const aggJson = (await aggRes.json()) as AggregatePoint[]
      setAggregate(aggJson)

      const todayRes = await fetch('/api/metrics/today?metric=power')
      const todayJson = (await todayRes.json()) as TodayPoint[]
      setToday(todayJson)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('loadCharts error', e)
    }
  }

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
    void loadCharts()
    const id = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void loadCharts()
  }, [granularity])

  const barData = useMemo(() => {
    return {
      labels: aggregate.map((p) => new Date(p.bucket).toLocaleDateString()),
      datasets: [
        {
          label: 'Средняя мощность, W',
          data: aggregate.map((p) => p.value ?? 0),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
        },
      ],
    }
  }, [aggregate])

  const lineData = useMemo(() => {
    return {
      labels: today.map((p) =>
        new Date(p.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      ),
      datasets: [
        {
          label: 'Мощность сегодня, W',
          data: today.map((p) => p.value ?? 0),
          borderColor: 'rgba(255, 159, 64, 1)',
          backgroundColor: 'rgba(255, 159, 64, 0.3)',
          tension: 0.2,
        },
      ],
    }
  }, [today])

  const todayTotal = useMemo(() => {
    if (today.length < 2) return 0
    let energyWs = 0
    for (let i = 0; i < today.length - 1; i++) {
      const p1 = today[i].value ?? 0
      const p2 = today[i + 1].value ?? 0
      const t1 = new Date(today[i].ts).getTime()
      const t2 = new Date(today[i + 1].ts).getTime()
      const dtSec = (t2 - t1) / 1000
      energyWs += ((p1 + p2) / 2) * dtSec
    }
    return energyWs / 3600
  }, [today])

  return (
    <>
      <h1>Tuya DC шунт</h1>

      <div className="card">
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Обновляю…' : 'Обновить'}
        </button>
        <button
          style={{ marginLeft: 12 }}
          onClick={() => void callSync('/api/tuya/sync/history-year', 'Синхронизирую год')}
        >
          Синхронизировать год
        </button>
        <button
          style={{ marginLeft: 12 }}
          onClick={() =>
            void callSync('/api/tuya/sync/history-yesterday', 'Синхронизирую вчера')
          }
        >
          Синхронизировать вчера
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
        {syncStatus ? (
          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{syncStatus}</p>
        ) : null}
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

      <div className="card" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Энергия по периодам (bar)</h2>
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setGranularity('day')}
            disabled={granularity === 'day'}
          >
            Дни
          </button>
          <button
            onClick={() => setGranularity('month')}
            disabled={granularity === 'month'}
            style={{ marginLeft: 8 }}
          >
            Месяцы
          </button>
          <button
            onClick={() => setGranularity('year')}
            disabled={granularity === 'year'}
            style={{ marginLeft: 8 }}
          >
            Годы
          </button>
        </div>
        <Bar data={barData} />
      </div>

      <div className="card" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Текущий день (line)</h2>
        <Line data={lineData} />
        <p style={{ marginTop: 8 }}>
          Суммарно за день:{' '}
          <b>
            {Number.isFinite(todayTotal) ? todayTotal.toFixed(1) : '—'} Вт·ч
          </b>
        </p>
      </div>
    </>
  )
}

export default App
