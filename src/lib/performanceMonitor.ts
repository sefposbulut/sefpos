interface PerfMark {
  name: string;
  timestamp: number;
}

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
}

class PerformanceMonitor {
  private marks = new Map<string, PerfMark>();
  private metrics: PerformanceMetric[] = [];

  mark(name: string) {
    this.marks.set(name, {
      name,
      timestamp: performance.now(),
    });
  }

  measure(name: string, startMark: string, endMark?: string) {
    const start = this.marks.get(startMark);
    if (!start) return null;

    const end = endMark ? this.marks.get(endMark) : { timestamp: performance.now() };
    if (!end) return null;

    const duration = end.timestamp - start.timestamp;
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
    };

    this.metrics.push(metric);

    if (duration > 100) {
      console.warn(`[PERF] ${name}: ${duration.toFixed(2)}ms`);
    } else {
      console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  clear() {
    this.marks.clear();
    this.metrics = [];
  }

  getMetrics() {
    return this.metrics;
  }
}

export const perfMonitor = new PerformanceMonitor();

export function withPerformanceTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  label: string
): T {
  return (async (...args: any[]) => {
    const startMark = `${label}-start`;
    const endMark = `${label}-end`;

    perfMonitor.mark(startMark);
    try {
      const result = await fn(...args);
      perfMonitor.mark(endMark);
      perfMonitor.measure(label, startMark, endMark);
      return result;
    } catch (err) {
      perfMonitor.mark(endMark);
      perfMonitor.measure(`${label}-error`, startMark, endMark);
      throw err;
    }
  }) as T;
}
