import type { DeliveryNotice } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
/** One shared hourly budget for P04 notifications and memory proposals, including reminders. */
export declare function notificationDeliveryHistory(store: WhaleStore): DeliveryNotice[];
