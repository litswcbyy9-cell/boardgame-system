import { ReportsService } from './reports.service';
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    revenue(date?: string): Promise<any>;
    gamePopularity(days?: string): Promise<any[]>;
    tableUtilization(days?: string): Promise<any[]>;
}
