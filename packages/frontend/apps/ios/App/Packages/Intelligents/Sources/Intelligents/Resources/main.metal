#include <metal_stdlib>

using namespace metal;

namespace ParticleTransitionSystem {
    
    struct TrollParticle {
        float2 position;
        float2 velocity;
        float life;
        float duration;
    };
    
    struct TrollVertex {
        float4 position [[position]];
        float2 uv;
        float opacity;
    };
    
}

// 顶点着色器 负责将粒子数据转换为顶点数据
vertex ParticleTransitionSystem::TrollVertex PTS_ParticleVertex(const device ParticleTransitionSystem::TrollVertex *vertices [[buffer(0)]],
                             const device float2 &resolution [[buffer(1)]],
                             const device ParticleTransitionSystem::TrollParticle *particles [[buffer(2)]],
                             const device float2 &targetFrameSize [[buffer(3)]],
                             const device float &stepSize [[buffer(4)]],
                             unsigned int vid [[vertex_id]],
                             unsigned int particleId [[instance_id]]) {
    ParticleTransitionSystem::TrollVertex v = vertices[vid];
    ParticleTransitionSystem::TrollParticle p = particles[particleId];
    
    int particlesPerRow = int(targetFrameSize.x / stepSize);
    int row = particleId / particlesPerRow;
    int col = particleId % particlesPerRow;
    
    float2 originalPos = float2(col * stepSize + stepSize / 2.0, row * stepSize + stepSize / 2.0);
    float2 currentPos = p.position;
    
    // 计算目标帧在屏幕中的居中偏移
    float2 offset = (resolution - targetFrameSize) / 2.0;
    
    // 设置UV坐标用于纹理采样
    v.uv.x = originalPos.x / targetFrameSize.x;
    v.uv.y = originalPos.y / targetFrameSize.y;
    
    // 计算最终的屏幕位置
    float particleSize = stepSize;
    float2 worldPos = v.position.xy * particleSize + currentPos + offset;
    
    // 转换到NDC坐标系 (-1到1)
    v.position.x = (worldPos.x / resolution.x) * 2.0 - 1.0;
    v.position.y = 1.0 - (worldPos.y / resolution.y) * 2.0;
    
    // 逐渐消失
    v.opacity = p.life / p.duration;
    
    return v;
}

// 片段着色器 负责将顶点数据转换为像素颜色
fragment float4 PTS_ParticleFragment(ParticleTransitionSystem::TrollVertex in [[stage_in]],
                                 const texture2d<float> texture [[texture(0)]],
                                 const sampler textureSampler [[sampler(0)]]) {
    constexpr sampler samplr;
    float4 color = texture.sample(samplr, in.uv);
    float a = color.a * in.opacity; // apply texture alpha
    color *= in.opacity; // apply opacity from vertex shader aka pre-multiplied alpha
    color.a = a;
    return color;
}

// 计算粒子位置和速度的计算着色器 负责更新粒子的位置和速度
kernel void PTS_UpdateParticles(device ParticleTransitionSystem::TrollParticle *particles [[buffer(0)]],
                            unsigned int index [[thread_position_in_grid]]) {
    if (particles[index].life >= 0) {
        particles[index].position += particles[index].velocity;

        // 模拟空气阻力，降低速度 x, y 分量
        particles[index].velocity.x *= 0.99;
        particles[index].velocity.y *= 0.99;

        // 模拟重力影响，增加 y 分量
        particles[index].velocity.y += 0.1;
    }
    particles[index].life -= 1.0;
}
