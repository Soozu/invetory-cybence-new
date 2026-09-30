import { expireReservations } from './reservationService.js'

const jobs = [{ name: 'reservation-expiry', intervalMs: 60000, run: expireReservations }]
export const jobStatus = new Map()
export function startJobs() {
  const timers = jobs.map(job => {
    const state = { running: false, lastRunAt: null, lastSuccessAt: null, lastError: null }
    jobStatus.set(job.name, state)
    const run = async () => {
      if (state.running) return
      state.running = true; state.lastRunAt = new Date()
      try { await job.run(); state.lastSuccessAt = new Date(); state.lastError = null }
      catch (error) { state.lastError = 'Job failed; check server logs.'; console.error(JSON.stringify({ level: 'error', event: 'job_failed', job: job.name, code: error.code || null, status: error.status || null })) }
      finally { state.running = false }
    }
    run()
    const timer = setInterval(run, job.intervalMs); timer.unref(); return timer
  })
  return () => timers.forEach(clearInterval)
}
