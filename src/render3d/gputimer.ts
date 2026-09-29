/**
 * gputimer.ts — how long the GPU spent on a frame, where the browser says.
 *
 * The wall clock cannot tell a frame that fits its 16.7 ms with room to spare
 * from one that only just fits: at 60 Hz both come back at 16.7. The governor
 * needs the difference to climb back after it has stepped down, and
 * `EXT_disjoint_timer_query_webgl2` (desktop Chrome and Edge; not Safari or
 * Firefox by default) gives it. Queries finish a few frames late and are read
 * without blocking; a disjoint (a GPU reset, a power-state change) throws the
 * reading away. Where the extension is missing every call is a no-op and
 * `poll` returns null.
 */

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: TimerExt | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly spare: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    let ext: TimerExt | null = null;
    try {
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    } catch {
      ext = null;
    }
    this.ext = ext;
  }

  begin(): void {
    const { gl, ext } = this;
    if (!ext || this.active || this.pending.length >= 4) return;
    const q = this.spare.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    const { gl, ext } = this;
    if (!ext || !this.active) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** The newest finished measurement, ms, or null when none has finished. */
  poll(): number | null {
    const { gl, ext } = this;
    if (!ext) return null;
    let out: number | null = null;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      this.pending.shift();
      this.spare.push(q);
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out = ns / 1e6;
    }
    return out;
  }
}
