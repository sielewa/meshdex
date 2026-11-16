import { HealthImplementation } from 'grpc-health-check';
import { READINESS_SERVICE } from './health.constants';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let health: { setStatus: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    health = { setStatus: jest.fn() };
    service = new HealthService(health as unknown as HealthImplementation);
  });

  it('reports live and ready once the app has bootstrapped', () => {
    service.onApplicationBootstrap();

    expect(health.setStatus).toHaveBeenCalledWith('', 'SERVING');
    expect(health.setStatus).toHaveBeenCalledWith(READINESS_SERVICE, 'SERVING');
  });

  it('stops being ready on shutdown but stays live while draining', () => {
    service.beforeApplicationShutdown();

    expect(health.setStatus).toHaveBeenCalledWith(READINESS_SERVICE, 'NOT_SERVING');
    expect(health.setStatus).not.toHaveBeenCalledWith('', 'NOT_SERVING');
  });
});
