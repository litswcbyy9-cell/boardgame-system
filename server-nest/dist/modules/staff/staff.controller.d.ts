import { StaffService } from './staff.service';
export declare class StaffController {
    private readonly staffService;
    constructor(staffService: StaffService);
    search(q?: string, status?: string): Promise<any[]>;
    create(body: any): Promise<{
        id: number;
        employeeNo: string;
    }>;
    update(id: string, body: any): Promise<{
        ok: boolean;
    }>;
    disable(id: string): Promise<{
        ok: boolean;
    }>;
    createAccount(id: string, body: any): Promise<{
        ok: boolean;
    }>;
}
