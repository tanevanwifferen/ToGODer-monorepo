export interface ExerciseStats {
  averageMinutes: number;
  totalMinutes: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface MentalHealthStats {
  averageValence: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface SleepStats {
  averageTimeSpentInBed: number; // in minutes
  averageGoingToBedtime: string; // in HH:mm format
  averageWakeUpTime: string;  // Add this line
  periodStart: Date;
  periodEnd: Date;
}

export interface IHealthService {
  requestPermissions(): Promise<boolean>;
  getWeeklyExerciseStats(): Promise<ExerciseStats>;
  getSixWeekExerciseStats(): Promise<ExerciseStats>;
  getSixMonthExerciseStats(): Promise<ExerciseStats>;
  checkAvailability(): Promise<boolean>;
  
  // Mental health methods
  getDailyMentalHealthStats(): Promise<MentalHealthStats>;
  getWeeklyMentalHealthStats(): Promise<MentalHealthStats>;
  getMonthlyMentalHealthStats(): Promise<MentalHealthStats>;

  // Sleep methods
  getWeeklySleepStats(): Promise<SleepStats>;
  getMonthlySleepStats(): Promise<SleepStats>;
}
