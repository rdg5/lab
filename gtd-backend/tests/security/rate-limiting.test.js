"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_db_1 = require("../helpers/test-db");
const factories_1 = require("../helpers/factories");
const rate_limiting_1 = require("@/services/rate-limiting"); // This will fail - doesn't exist yet
const node_1 = require("msw/node");
describe('Rate Limiting Security', () => {
    let dbManager;
    let rateLimitService;
    let server;
    beforeAll(() => {
        server = (0, node_1.setupServer)();
        server.listen();
    });
    beforeEach(async () => {
        dbManager = new test_db_1.TestDbManager();
        const db = await dbManager.setup();
        // This will fail - service doesn't exist
        rateLimitService = new rate_limiting_1.RateLimitService({
            redis: {
                host: 'localhost',
                port: 6379,
                db: 1, // Test database
            },
            defaultLimits: {
                windowMs: 900000, // 15 minutes
                maxRequests: 100,
            },
        });
    });
    afterEach(async () => {
        await dbManager.cleanup();
        server.resetHandlers();
    });
    afterAll(() => {
        server.close();
    });
    describe('Authentication Rate Limiting', () => {
        it('should rate limit OAuth authentication attempts', async () => {
            const clientIp = '192.168.1.100';
            const endpoint = 'auth.googleOAuth';
            // Configure strict limits for auth endpoints
            const authLimits = {
                windowMs: 900000, // 15 minutes
                maxRequests: 10, // Only 10 attempts per 15 minutes
            };
            // This should fail - method doesn't exist
            await rateLimitService.setEndpointLimits(endpoint, authLimits);
            // Make requests up to the limit
            const requests = [];
            for (let i = 0; i < 10; i++) {
                requests.push(rateLimitService.checkLimit(clientIp, endpoint));
            }
            const results = await Promise.all(requests);
            // All should pass
            results.forEach(result => {
                expect(result.allowed).toBe(true);
                expect(result.remaining).toBeGreaterThanOrEqual(0);
            });
            // 11th request should be blocked
            const blockedResult = await rateLimitService.checkLimit(clientIp, endpoint);
            expect(blockedResult.allowed).toBe(false);
            expect(blockedResult.remaining).toBe(0);
            expect(blockedResult.resetTime).toBeInstanceOf(Date);
        });
        it('should have different limits for different auth endpoints', async () => {
            const clientIp = '192.168.1.101';
            const limits = {
                'auth.googleOAuth': { windowMs: 900000, maxRequests: 5 },
                'auth.githubOAuth': { windowMs: 900000, maxRequests: 5 },
                'auth.refreshToken': { windowMs: 900000, maxRequests: 20 }, // More lenient
                'auth.validateToken': { windowMs: 900000, maxRequests: 100 }, // Very lenient
            };
            // Set different limits for each endpoint
            for (const [endpoint, limit] of Object.entries(limits)) {
                await rateLimitService.setEndpointLimits(endpoint, limit);
            }
            // Test OAuth endpoints have strict limits
            for (let i = 0; i < 6; i++) {
                const result = await rateLimitService.checkLimit(clientIp, 'auth.googleOAuth');
                if (i < 5) {
                    expect(result.allowed).toBe(true);
                }
                else {
                    expect(result.allowed).toBe(false);
                }
            }
            // Test token validation has lenient limits
            for (let i = 0; i < 50; i++) {
                const result = await rateLimitService.checkLimit(clientIp, 'auth.validateToken');
                expect(result.allowed).toBe(true);
            }
        });
        it('should implement exponential backoff for repeated violations', async () => {
            const clientIp = '192.168.1.102';
            const endpoint = 'auth.googleOAuth';
            // Set low limit for testing
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000, // 1 minute
                maxRequests: 3,
            });
            // Exhaust the limit
            for (let i = 0; i < 4; i++) {
                await rateLimitService.checkLimit(clientIp, endpoint);
            }
            // Check penalty increases with repeated violations
            const violation1 = await rateLimitService.checkLimit(clientIp, endpoint);
            expect(violation1.allowed).toBe(false);
            expect(violation1.penaltyMultiplier).toBe(1);
            // Wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 100));
            const violation2 = await rateLimitService.checkLimit(clientIp, endpoint);
            expect(violation2.allowed).toBe(false);
            expect(violation2.penaltyMultiplier).toBeGreaterThan(1);
        });
        it('should track rate limit violations in audit log', async () => {
            const db = dbManager.getKysely();
            const clientIp = '192.168.1.103';
            const endpoint = 'auth.googleOAuth';
            const userAgent = 'Test Client 1.0';
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000,
                maxRequests: 2,
            });
            // Exhaust limit and trigger violation
            await rateLimitService.checkLimit(clientIp, endpoint, { userAgent });
            await rateLimitService.checkLimit(clientIp, endpoint, { userAgent });
            await rateLimitService.checkLimit(clientIp, endpoint, { userAgent }); // This should violate
            // Check audit trail
            const auditRecord = await db
                .selectFrom('audit_trails')
                .where('action', '=', 'rate_limit_violation')
                .where('ip_address', '=', clientIp)
                .selectAll()
                .executeTakeFirst();
            expect(auditRecord).toBeTruthy();
            expect(auditRecord?.entity_type).toBe('rate_limit');
            expect(auditRecord?.user_agent).toBe(userAgent);
            expect(auditRecord?.new_values).toContain(endpoint);
        });
    });
    describe('API Rate Limiting', () => {
        it('should rate limit todo creation by user', async () => {
            const db = dbManager.getKysely();
            const user = factories_1.TestDataFactory.createUser();
            await db.insertInto('users').values(user).execute();
            const endpoint = 'todos.create';
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 300000, // 5 minutes
                maxRequests: 20, // 20 todos per 5 minutes
            });
            // Test user-specific limiting
            const userKey = `user:${user.id}`;
            // Create todos up to limit
            for (let i = 0; i < 20; i++) {
                const result = await rateLimitService.checkLimit(userKey, endpoint);
                expect(result.allowed).toBe(true);
            }
            // 21st todo should be blocked
            const blockedResult = await rateLimitService.checkLimit(userKey, endpoint);
            expect(blockedResult.allowed).toBe(false);
        });
        it('should rate limit LLM analysis requests more strictly', async () => {
            const user = factories_1.TestDataFactory.createUser();
            const endpoint = 'llm.analyzeTodo';
            // LLM endpoints should have stricter limits due to cost
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 3600000, // 1 hour
                maxRequests: 50, // 50 analyses per hour
            });
            const userKey = `user:${user.id}`;
            // Use up the limit
            for (let i = 0; i < 50; i++) {
                const result = await rateLimitService.checkLimit(userKey, endpoint);
                expect(result.allowed).toBe(true);
                expect(result.remaining).toBe(49 - i);
            }
            // Should block additional requests
            const blockedResult = await rateLimitService.checkLimit(userKey, endpoint);
            expect(blockedResult.allowed).toBe(false);
            expect(blockedResult.resetTime.getTime()).toBeGreaterThan(Date.now());
        });
        it('should implement sliding window rate limiting', async () => {
            const endpoint = 'todos.list';
            const userKey = 'user:test-sliding-window';
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000, // 1 minute
                maxRequests: 10,
                algorithm: 'sliding_window',
            });
            // Make 10 requests immediately
            for (let i = 0; i < 10; i++) {
                const result = await rateLimitService.checkLimit(userKey, endpoint);
                expect(result.allowed).toBe(true);
            }
            // Should be blocked
            const blocked1 = await rateLimitService.checkLimit(userKey, endpoint);
            expect(blocked1.allowed).toBe(false);
            // Wait 30 seconds (half the window)
            jest.useFakeTimers();
            jest.advanceTimersByTime(30000);
            // Should still be blocked (sliding window)
            const blocked2 = await rateLimitService.checkLimit(userKey, endpoint);
            expect(blocked2.allowed).toBe(false);
            // Wait another 30 seconds (full window passed)
            jest.advanceTimersByTime(30000);
            // Should now allow requests again
            const allowed = await rateLimitService.checkLimit(userKey, endpoint);
            expect(allowed.allowed).toBe(true);
            jest.useRealTimers();
        });
        it('should have progressive rate limiting for different user tiers', async () => {
            const endpoints = ['todos.create', 'todos.update', 'todos.delete'];
            const userTiers = [
                { tier: 'free', multiplier: 1 },
                { tier: 'premium', multiplier: 3 },
                { tier: 'enterprise', multiplier: 10 },
            ];
            const baseLimits = {
                windowMs: 3600000, // 1 hour
                maxRequests: 100,
            };
            for (const { tier, multiplier } of userTiers) {
                const userKey = `user:${tier}-user`;
                // This should fail - method doesn't exist
                await rateLimitService.setUserTier(userKey, tier);
                for (const endpoint of endpoints) {
                    const expectedLimit = baseLimits.maxRequests * multiplier;
                    // Test that user can make requests up to their tier limit
                    for (let i = 0; i < Math.min(expectedLimit, 20); i++) { // Test first 20
                        const result = await rateLimitService.checkLimit(userKey, endpoint);
                        expect(result.allowed).toBe(true);
                        expect(result.limit).toBe(expectedLimit);
                    }
                }
            }
        });
    });
    describe('Security Attack Prevention', () => {
        it('should detect and block distributed brute force attacks', async () => {
            const endpoint = 'auth.googleOAuth';
            const baseIp = '192.168.1.';
            // Configure detection for distributed attacks
            await rateLimitService.configureDistributedAttackDetection({
                timeWindow: 300000, // 5 minutes
                maxUniqueIPs: 10,
                maxTotalRequests: 50,
            });
            // Simulate requests from multiple IPs
            const requests = [];
            for (let ip = 1; ip <= 15; ip++) {
                for (let req = 0; req < 5; req++) {
                    requests.push({
                        ip: `${baseIp}${ip}`,
                        endpoint,
                        timestamp: Date.now(),
                    });
                }
            }
            // This should trigger distributed attack detection
            const results = [];
            for (const request of requests) {
                const result = await rateLimitService.checkLimit(request.ip, request.endpoint);
                results.push(result);
            }
            // Should detect pattern and start blocking
            const blockedResults = results.filter(r => !r.allowed);
            expect(blockedResults.length).toBeGreaterThan(0);
            // Should have flagged as distributed attack
            const attackDetection = await rateLimitService.getAttackDetectionStatus();
            expect(attackDetection.distributedAttackDetected).toBe(true);
            expect(attackDetection.attackPattern).toBe('distributed_brute_force');
        });
        it('should implement CAPTCHA requirement after multiple violations', async () => {
            const clientIp = '192.168.1.104';
            const endpoint = 'auth.googleOAuth';
            // Configure CAPTCHA trigger
            await rateLimitService.configureCAPTCHARequirement({
                violationThreshold: 3,
                requirementDuration: 3600000, // 1 hour
            });
            // Trigger multiple violations
            for (let i = 0; i < 5; i++) {
                await rateLimitService.checkLimit(clientIp, endpoint);
            }
            // Should now require CAPTCHA
            const result = await rateLimitService.checkLimit(clientIp, endpoint);
            expect(result.allowed).toBe(false);
            expect(result.requiresCAPTCHA).toBe(true);
            expect(result.captchaToken).toBeTruthy();
            // Should allow request with valid CAPTCHA
            const validResult = await rateLimitService.checkLimit(clientIp, endpoint, {
                captchaResponse: 'valid-captcha-response',
            });
            expect(validResult.allowed).toBe(true);
        });
        it('should detect and block suspicious request patterns', async () => {
            const clientIp = '192.168.1.105';
            // Configure pattern detection
            await rateLimitService.configureSuspiciousPatternDetection({
                rapidFireThreshold: 10, // More than 10 requests per second
                uniformIntervalThreshold: 0.95, // Too uniform timing
                sequentialEndpointPattern: true, // Accessing endpoints in order
            });
            // Simulate rapid fire requests
            const rapidRequests = [];
            const startTime = Date.now();
            for (let i = 0; i < 15; i++) {
                rapidRequests.push(rateLimitService.checkLimit(clientIp, 'todos.list', {
                    timestamp: startTime + (i * 50), // 50ms intervals (20/second)
                }));
            }
            const results = await Promise.all(rapidRequests);
            // Should detect suspicious pattern and start blocking
            const laterResults = results.slice(10);
            expect(laterResults.some(r => !r.allowed && r.suspiciousPattern)).toBe(true);
        });
        it('should implement IP-based geolocation filtering', async () => {
            const suspiciousIPs = [
                '1.2.3.4', // Simulated suspicious location
                '5.6.7.8', // Another suspicious location
            ];
            const legitimateIPs = [
                '192.168.1.1', // Local network
                '8.8.8.8', // Google DNS (simulated legitimate)
            ];
            // Configure geo-filtering
            await rateLimitService.configureGeoFiltering({
                blockedCountries: ['XX', 'YY'], // Simulated country codes
                allowedRegions: ['US', 'CA', 'EU'],
                strictMode: false,
            });
            // Test suspicious IPs
            for (const ip of suspiciousIPs) {
                const result = await rateLimitService.checkLimit(ip, 'auth.googleOAuth');
                expect(result.allowed).toBe(false);
                expect(result.geoBlocked).toBe(true);
                expect(result.location).toBeDefined();
            }
            // Test legitimate IPs
            for (const ip of legitimateIPs) {
                const result = await rateLimitService.checkLimit(ip, 'auth.googleOAuth');
                // These might be allowed or have different rules
                if (!result.allowed) {
                    expect(result.geoBlocked).toBeFalsy();
                }
            }
        });
    });
    describe('Rate Limit Bypass Prevention', () => {
        it('should prevent header-based IP spoofing', async () => {
            const realIp = '192.168.1.106';
            const spoofedIp = '127.0.0.1';
            const endpoint = 'auth.googleOAuth';
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000,
                maxRequests: 2,
            });
            // Attempt to bypass with spoofed headers
            const headers = {
                'x-forwarded-for': spoofedIp,
                'x-real-ip': spoofedIp,
                'x-client-ip': spoofedIp,
            };
            // Use up limit with real IP
            await rateLimitService.checkLimit(realIp, endpoint);
            await rateLimitService.checkLimit(realIp, endpoint);
            // Should be blocked even with spoofed headers
            const result = await rateLimitService.checkLimit(realIp, endpoint, { headers });
            expect(result.allowed).toBe(false);
            expect(result.detectedSpoofing).toBe(true);
        });
        it('should prevent user-agent rotation bypass attempts', async () => {
            const clientIp = '192.168.1.107';
            const endpoint = 'auth.googleOAuth';
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                'curl/7.68.0',
                'Postman/7.36.0',
            ];
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000,
                maxRequests: 3,
            });
            // Try to bypass by rotating user agents
            for (let i = 0; i < 5; i++) {
                const userAgent = userAgents[i % userAgents.length];
                const result = await rateLimitService.checkLimit(clientIp, endpoint, { userAgent });
                if (i < 3) {
                    expect(result.allowed).toBe(true);
                }
                else {
                    expect(result.allowed).toBe(false);
                    expect(result.bypassAttempt).toBe('user_agent_rotation');
                }
            }
        });
        it('should detect session-based bypass attempts', async () => {
            const endpoint = 'todos.create';
            const baseUserId = 'user-bypass-test-';
            await rateLimitService.setEndpointLimits(endpoint, {
                windowMs: 60000,
                maxRequests: 5,
            });
            // Attempt bypass by creating multiple sessions/users
            const sessionIds = [];
            for (let i = 0; i < 10; i++) {
                sessionIds.push(`${baseUserId}${i}`);
            }
            const results = [];
            for (const sessionId of sessionIds) {
                const result = await rateLimitService.checkLimit(sessionId, endpoint, {
                    fingerprint: 'same-browser-fingerprint', // Same device/browser
                });
                results.push(result);
            }
            // Should detect and block session multiplication
            const blockedResults = results.filter(r => !r.allowed);
            expect(blockedResults.length).toBeGreaterThan(0);
            expect(blockedResults[0].bypassAttempt).toBe('session_multiplication');
        });
    });
    describe('Rate Limit Monitoring and Alerting', () => {
        it('should track rate limit metrics', async () => {
            const endpoint = 'todos.create';
            const clientIp = '192.168.1.108';
            // Generate some traffic
            for (let i = 0; i < 10; i++) {
                await rateLimitService.checkLimit(clientIp, endpoint);
            }
            // This should fail - method doesn't exist
            const metrics = await rateLimitService.getMetrics(endpoint);
            expect(metrics).toMatchObject({
                totalRequests: expect.any(Number),
                allowedRequests: expect.any(Number),
                blockedRequests: expect.any(Number),
                averageRequestsPerMinute: expect.any(Number),
                peakRequestsPerMinute: expect.any(Number),
                topClientIPs: expect.any(Array),
            });
            expect(metrics.totalRequests).toBeGreaterThanOrEqual(10);
        });
        it('should alert on unusual traffic patterns', async () => {
            const endpoint = 'auth.googleOAuth';
            const alertThresholds = {
                requestSpike: 500, // 500% increase in requests
                errorRate: 0.5, // 50% error rate
                uniqueIPs: 100, // More than 100 unique IPs
            };
            await rateLimitService.configureAlerts(alertThresholds);
            // Simulate traffic spike
            const requests = [];
            for (let i = 0; i < 1000; i++) {
                const ip = `10.0.${Math.floor(i / 254)}.${i % 254}`;
                requests.push(rateLimitService.checkLimit(ip, endpoint));
            }
            await Promise.all(requests);
            const alerts = await rateLimitService.getActiveAlerts();
            expect(alerts.length).toBeGreaterThan(0);
            expect(alerts.some(alert => alert.type === 'request_spike')).toBe(true);
            expect(alerts.some(alert => alert.type === 'unique_ip_spike')).toBe(true);
        });
        it('should provide rate limit status dashboard data', async () => {
            const endpoints = ['auth.googleOAuth', 'todos.create', 'llm.analyzeTodo'];
            // Generate some test data
            for (const endpoint of endpoints) {
                for (let i = 0; i < 5; i++) {
                    await rateLimitService.checkLimit(`192.168.1.${100 + i}`, endpoint);
                }
            }
            const dashboardData = await rateLimitService.getDashboardData();
            expect(dashboardData).toMatchObject({
                endpoints: expect.any(Object),
                systemHealth: expect.objectContaining({
                    totalRequests: expect.any(Number),
                    blockedRequests: expect.any(Number),
                    errorRate: expect.any(Number),
                }),
                topBlockedIPs: expect.any(Array),
                recentAlerts: expect.any(Array),
                performanceMetrics: expect.objectContaining({
                    averageResponseTime: expect.any(Number),
                    p95ResponseTime: expect.any(Number),
                }),
            });
        });
    });
});
//# sourceMappingURL=rate-limiting.test.js.map