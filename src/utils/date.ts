import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { config } from '@/config/manager';

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatDate = (date: Date, timeZone?: string): string => {
  return dayjs(date)
    .tz(timeZone ?? config.timeZone)
    .format('YYYY-MM-DDTHH:mm:ssZ');
};
