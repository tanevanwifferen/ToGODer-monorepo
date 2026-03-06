import { ExerciseStats, IHealthService, MentalHealthStats, SleepStats } from './types';

export class WebHealthService implements IHealthService {
  async requestPermissions(): Promise<boolean> {
    return false;
  }

  private createEmptyStats(periodInDays: number): ExerciseStats {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodInDays);

    return {
      averageMinutes: 0,
      totalMinutes: 0,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  private createEmptyMentalHealthStats(periodInDays: number): MentalHealthStats {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodInDays);

    return {
      averageValence: 0,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  private createEmptySleepStats(periodInDays: number): SleepStats {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodInDays);

    return {
      averageTimeSpentInBed: 0,
      averageGoingToBedtime: "00:00",
      averageWakeUpTime: "00:00",
      periodStart: startDate,
      periodEnd: endDate
    };
  }

  async getWeeklyExerciseStats(): Promise<ExerciseStats> {
    return this.createEmptyStats(7);
  }

  async getSixWeekExerciseStats(): Promise<ExerciseStats> {
    return this.createEmptyStats(42);
  }

  async getSixMonthExerciseStats(): Promise<ExerciseStats> {
    return this.createEmptyStats(180);
  }

  async checkAvailability(): Promise<boolean> {
    return false;
  }

  async getDailyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.createEmptyMentalHealthStats(1);
  }

  async getWeeklyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.createEmptyMentalHealthStats(7);
  }

  async getMonthlyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.createEmptyMentalHealthStats(30);
  }

  async getWeeklySleepStats(): Promise<SleepStats> {
    return this.createEmptySleepStats(7);
  }

  async getMonthlySleepStats(): Promise<SleepStats> {
    return this.createEmptySleepStats(30);
  }
}
