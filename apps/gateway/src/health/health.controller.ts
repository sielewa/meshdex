import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

/** HTTP probes for Kubernetes (`livenessProbe` / `readinessProbe` in the Helm chart). */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: string } {
    if (!this.healthService.isReady()) {
      throw new ServiceUnavailableException('shutting down');
    }

    return { status: 'ok' };
  }
}
