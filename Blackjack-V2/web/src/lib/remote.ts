// Ranked Daily Table: every action goes to the `daily` Edge Function, which
// holds the shoe. The client only ever sees the public view.
import type { HumanAction, StepResult, TableDriver } from '../game/driver';
import type { RankInfo } from '../components/Results';
import { callDaily } from './supabase';

interface DailyResponse extends StepResult {
  day: string;
  status: 'playing' | 'finished';
  rank?: RankInfo;
}

export class RemoteDailyDriver implements TableDriver {
  mode = 'daily' as const;
  ranked = true;
  humanSeat = 2;
  private rank: RankInfo | null = null;

  constructor(public day: string) {}

  private async call(body: Record<string, unknown>): Promise<DailyResponse> {
    const data = await callDaily<DailyResponse>(body);
    if (data.rank) this.rank = data.rank;
    this.day = data.day;
    return data;
  }

  start() {
    return this.call({ op: 'start' });
  }

  act(action: HumanAction) {
    return this.call({ op: 'act', day: this.day, action });
  }

  async finish(): Promise<RankInfo | null> {
    return this.rank;
  }
}
