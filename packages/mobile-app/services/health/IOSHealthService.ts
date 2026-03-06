import HealthKit, {
  QuantityTypeIdentifier,
  CategoryTypeIdentifier,
} from "@kingstinct/react-native-healthkit";

import {
  ExerciseStats,
  IHealthService,
  MentalHealthStats,
  SleepStats,
} from "./types";

export class IOSHealthService implements IHealthService {
  private static exerciseCache: Map<string, ExerciseStats> = new Map();
  private static sleepCache: Map<string, SleepStats> = new Map();
  private static lastCacheTime: number | null = null;
  private static readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
  private static readonly MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

  private static convertToLocalTime(date: Date | string): Date {
    const originalDate = typeof date === "string" ? new Date(date) : date;
    return new Date(
      originalDate.getTime() + originalDate.getTimezoneOffset() * 60000
    );
  }

  private static createDateRange(periodInDays: number): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = new Date();
    // Ensure end date is at the end of the current day in local time
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(
      endDate.getTime() - periodInDays * this.MILLISECONDS_PER_DAY
    );
    // Ensure start date is at the beginning of the day in local time
    startDate.setHours(0, 0, 0, 0);

    return { startDate, endDate };
  }

  async requestPermissions(): Promise<boolean> {
    try {
      await HealthKit.requestAuthorization({
        toRead: [
          "HKQuantityTypeIdentifierActiveEnergyBurned" as QuantityTypeIdentifier,
          "HKQuantityTypeIdentifierAppleExerciseTime" as QuantityTypeIdentifier,
          "HKQuantityTypeIdentifierDistanceWalkingRunning" as QuantityTypeIdentifier,
          "HKCategoryTypeIdentifierSleepAnalysis" as CategoryTypeIdentifier,
        ],
      });
      return true;
    } catch (error) {
      console.error("Error requesting iOS health permissions:", error);
      return false;
    }
  }

  private async getExerciseMinutes(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const samples = await HealthKit.queryQuantitySamples(
        "HKQuantityTypeIdentifierAppleExerciseTime" as QuantityTypeIdentifier,
        {
          limit: 0,
          filter: {
            date: {
              startDate,
              endDate,
            },
          },
        }
      );

      return samples.reduce((total: number, sample) => {
        // Convert sample dates to local time for accurate daily calculations
        const localStartDate = IOSHealthService.convertToLocalTime(
          sample.startDate
        );
        const localEndDate = IOSHealthService.convertToLocalTime(
          sample.endDate
        );

        // Only count samples that fall within our local time range
        if (localStartDate >= startDate && localEndDate <= endDate) {
          return total + sample.quantity;
        }
        return total;
      }, 0);
    } catch (error) {
      console.error("Error fetching iOS health data:", error);
      return 0;
    }
  }

  private calculateCircularMeanTime(times: Date[]): string {
    if (times.length === 0) return "00:00";

    const TWO_PI = 2 * Math.PI;

    // Calculate mean sine and cosine using hour+minute as angle
    const meanVector = times.reduce(
      (acc, time) => {
        console.log(time);
        // Convert time to angle (0 to 2π)
        const totalHours = time.getHours() + time.getMinutes() / 60;
        const angleInRadians = (totalHours * TWO_PI) / 24;

        return {
          sumSin: acc.sumSin + Math.sin(angleInRadians),
          sumCos: acc.sumCos + Math.cos(angleInRadians),
        };
      },
      { sumSin: 0, sumCos: 0 }
    );

    // Calculate average angle using atan2
    const avgSin = meanVector.sumSin / times.length;
    const avgCos = meanVector.sumCos / times.length;
    let meanAngle = Math.atan2(avgSin, avgCos);

    // Ensure positive angle
    if (meanAngle < 0) {
      meanAngle += TWO_PI;
    }

    // Convert back to hours
    let meanHours = (meanAngle * 24) / TWO_PI;

    // Convert to HH:MM format
    const hours = Math.floor(meanHours);
    const minutes = Math.floor((meanHours - hours) * 60);

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  private async getSleepData(
    startDate: Date,
    endDate: Date
  ): Promise<SleepStats> {
    try {
      const samples = await HealthKit.queryCategorySamples(
        "HKCategoryTypeIdentifierSleepAnalysis" as CategoryTypeIdentifier,
        {
          limit: 0,
          filter: {
            date: {
              startDate,
              endDate,
            },
          },
        }
      );

      const dailySleepSessions = new Map<
        string,
        {
          firstBedtime: Date | null;
          lastWakeTime: Date | null;
          totalSleepMinutes: number;
        }
      >();

      // Convert and sort samples
      const sortedSamples = samples
        .map((sample) => ({
          ...sample,
          localStartDate: IOSHealthService.convertToLocalTime(sample.startDate),
          localEndDate: IOSHealthService.convertToLocalTime(sample.endDate),
        }))
        .sort(
          (a, b) => a.localStartDate.getTime() - b.localStartDate.getTime()
        );

      // Group samples into sessions (gap of 4 hours = new session)
      let currentSession: typeof sortedSamples = [];
      const sessions: (typeof sortedSamples)[] = [];
      const FOUR_HOURS = 4 * 60 * 60 * 1000;

      sortedSamples.forEach((sample, index) => {
        if (
          index === 0 ||
          sample.localStartDate.getTime() -
            sortedSamples[index - 1].localEndDate.getTime() >
            FOUR_HOURS
        ) {
          if (currentSession.length > 0) {
            sessions.push(currentSession);
          }
          currentSession = [sample];
        } else {
          currentSession.push(sample);
        }
      });
      if (currentSession.length > 0) {
        sessions.push(currentSession);
      }

      // Process each session
      sessions.forEach((session) => {
        if (session.length === 0) return;

        const sessionStart = session[0].localStartDate;
        const sessionEnd = session[session.length - 1].localEndDate;

        if (sessionEnd < startDate || sessionStart > endDate) return;

        // If session ends after 4 AM, use the end date as the key
        // Otherwise, use the start date
        const FOUR_AM = 4;
        const dateKey =
          sessionEnd.getHours() >= FOUR_AM
            ? sessionEnd.toISOString().split("T")[0]
            : sessionStart.toISOString().split("T")[0];

        const totalMinutes = session.reduce((total, sample) => {
          const duration =
            (sample.localEndDate.getTime() - sample.localStartDate.getTime()) /
            (1000 * 60);
          return total + duration;
        }, 0);

        const existing = dailySleepSessions.get(dateKey) || {
          firstBedtime: null,
          lastWakeTime: null,
          totalSleepMinutes: 0,
        };

        dailySleepSessions.set(dateKey, {
          firstBedtime:
            existing.firstBedtime === null
              ? sessionStart
              : existing.firstBedtime,
          lastWakeTime: sessionEnd,
          totalSleepMinutes: existing.totalSleepMinutes + totalMinutes,
        });
      });

      // Rest of the function remains the same
      const bedtimes: Date[] = [];
      const wakeTimes: Date[] = [];
      let totalSleepMinutes = 0;
      let daysWithSleep = 0;

      dailySleepSessions.forEach(
        ({ firstBedtime, lastWakeTime, totalSleepMinutes: dailyTotal }) => {
          if (firstBedtime !== null) {
            bedtimes.push(firstBedtime);
          }
          if (lastWakeTime !== null) {
            wakeTimes.push(lastWakeTime);
          }
          if (dailyTotal > 0) {
            totalSleepMinutes += dailyTotal;
            daysWithSleep++;
          }
        }
      );

      // Calculate averages
      const averageGoingToBedtime = this.calculateCircularMeanTime(bedtimes);
      console.log("averageBedTime", averageGoingToBedtime);
      const averageWakeUpTime = this.calculateCircularMeanTime(wakeTimes);
      console.log("averageWakeTime", averageWakeUpTime);
      const averageTimeSpentInBed =
        daysWithSleep > 0 ? totalSleepMinutes / daysWithSleep : 0;

      return {
        averageTimeSpentInBed,
        averageGoingToBedtime,
        averageWakeUpTime,
        periodStart: startDate,
        periodEnd: endDate,
      };
    } catch (error) {
      console.error("Error fetching iOS sleep data:", error);
      return {
        averageTimeSpentInBed: 0,
        averageGoingToBedtime: "00:00",
        averageWakeUpTime: "00:00",
        periodStart: startDate,
        periodEnd: endDate,
      };
    }
  }

  private async getExerciseStats(periodInDays: number): Promise<ExerciseStats> {
    const cacheKey = `exercise_${periodInDays}`;

    if (
      IOSHealthService.exerciseCache.has(cacheKey) &&
      IOSHealthService.lastCacheTime &&
      Date.now() - IOSHealthService.lastCacheTime <
        IOSHealthService.CACHE_DURATION
    ) {
      return IOSHealthService.exerciseCache.get(cacheKey)!;
    }

    const { startDate, endDate } =
      IOSHealthService.createDateRange(periodInDays);

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      const emptyStart = new Date();
      emptyStart.setTime(0);
      return {
        averageMinutes: 0,
        totalMinutes: 0,
        periodStart: emptyStart,
        periodEnd: emptyStart,
      };
    }

    const totalMinutes = await this.getExerciseMinutes(startDate, endDate);

    const stats: ExerciseStats = {
      averageMinutes: totalMinutes / periodInDays,
      totalMinutes,
      periodStart: startDate,
      periodEnd: endDate,
    };

    IOSHealthService.exerciseCache.set(cacheKey, stats);
    IOSHealthService.lastCacheTime = Date.now();

    return stats;
  }

  private async getSleepStats(periodInDays: number): Promise<SleepStats> {
    const cacheKey = `sleep_${periodInDays}`;

    if (
      IOSHealthService.sleepCache.has(cacheKey) &&
      IOSHealthService.lastCacheTime &&
      Date.now() - IOSHealthService.lastCacheTime <
        IOSHealthService.CACHE_DURATION
    ) {
      return IOSHealthService.sleepCache.get(cacheKey)!;
    }

    const { startDate, endDate } =
      IOSHealthService.createDateRange(periodInDays);

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      const emptyStart = new Date();
      emptyStart.setTime(0);
      return {
        averageGoingToBedtime: "00:00",
        averageTimeSpentInBed: 0,
        averageWakeUpTime: "00:00",
        periodEnd: emptyStart,
        periodStart: emptyStart,
      };
    }

    const stats = await this.getSleepData(startDate, endDate);

    IOSHealthService.sleepCache.set(cacheKey, stats);
    IOSHealthService.lastCacheTime = Date.now();

    return stats;
  }

  private getMentalHealthStats(periodInDays: number): MentalHealthStats {
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - periodInDays * IOSHealthService.MILLISECONDS_PER_DAY
    );

    return {
      averageValence: 0,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async getWeeklyExerciseStats(): Promise<ExerciseStats> {
    return this.getExerciseStats(7);
  }

  async getSixWeekExerciseStats(): Promise<ExerciseStats> {
    return this.getExerciseStats(42);
  }

  async getSixMonthExerciseStats(): Promise<ExerciseStats> {
    return this.getExerciseStats(180);
  }

  async getDailyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.getMentalHealthStats(1);
  }

  async getWeeklyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.getMentalHealthStats(7);
  }

  async getMonthlyMentalHealthStats(): Promise<MentalHealthStats> {
    return this.getMentalHealthStats(30);
  }

  async getWeeklySleepStats(): Promise<SleepStats> {
    return this.getSleepStats(7);
  }

  async getMonthlySleepStats(): Promise<SleepStats> {
    return this.getSleepStats(30);
  }

  async checkAvailability(): Promise<boolean> {
    try {
      return HealthKit.isHealthDataAvailable();
    } catch (error) {
      console.error("Error checking HealthKit availability:", error);
      return false;
    }
  }
}
