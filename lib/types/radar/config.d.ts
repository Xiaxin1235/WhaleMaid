import Schema from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import type { RadarSettings, RadarSource } from '#whalemaid/core';
export interface RadarConfig {
    enabled?: Volatile<boolean>;
    sources?: Partial<Record<RadarSource, Volatile<boolean>>>;
    checkHours?: Volatile<number>;
}
export declare const RadarConfigSchema: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    sources: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
    checkHours: Schema<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    sources: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
    checkHours: Schema<number, number, "volatile-defined">;
}>>, "defined">;
export declare function readRadarConfig(config: RadarConfig | undefined): RadarSettings;
