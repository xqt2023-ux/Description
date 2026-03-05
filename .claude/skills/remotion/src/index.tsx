import { Composition, registerRoot } from 'remotion';
import React from 'react';

// 案例组件按需导入（从案例库复制到此处后取消注释）
// import { CycleFlowchart } from '../案例库/循环流程图/CycleFlowchart';
// import { SkillsFlowchart } from '../案例库/技能流程图/SkillsFlowchart';
// import { CuteFlowchart } from '../案例库/可爱流程图/CuteFlowchart';

const Root: React.FC = () => {
  return (
    <>
      {/* 示例 Composition - 按需替换为实际组件 */}
      <Composition
        id="cycle-flowchart"
        durationInFrames={240}
        fps={30}
        width={800}
        height={600}
        component={() => null}
      />
      <Composition
        id="morandi-grid"
        durationInFrames={210}
        fps={30}
        width={800}
        height={600}
        component={() => null}
      />
      <Composition
        id="cute-flowchart"
        durationInFrames={180}
        fps={30}
        width={800}
        height={600}
        component={() => null}
      />
      <Composition
        id="static-vs-dynamic"
        durationInFrames={240}
        fps={30}
        width={800}
        height={600}
        component={() => null}
      />
      <Composition
        id="three-steps"
        durationInFrames={210}
        fps={30}
        width={800}
        height={600}
        component={() => null}
      />
    </>
  );
};

registerRoot(Root);
