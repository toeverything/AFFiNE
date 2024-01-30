import FourPMarketingMatrix from './edgeless/4P Marketing Matrix.json';
import FiveWTwoH from './edgeless/5W2H.json';
import BusinessProposal from './edgeless/Business Proposal.json';
import ConceptMap from './edgeless/Concept Map.json';
import DataAnalysis from './edgeless/Data Analysis.json';
import FishboneDiagram from './edgeless/Fishbone Diagram.json';
import Flowchart from './edgeless/Flowchart.json';
import GanttChart from './edgeless/Gantt Chart.json';
import MonthlyCalendar from './edgeless/Monthly Calendar.json';
import ProjectPlanning from './edgeless/Project Planning.json';
import ProjectTrackingKanban from './edgeless/Project Tracking Kanban.json';
import SimplePresentation from './edgeless/Simple Presentation.json';
import SMART from './edgeless/SMART.json';
import Storyboard from './edgeless/Storyboard.json';
import SWOT from './edgeless/SWOT.json';
import UserJourneyMap from './edgeless/User Journey Map.json';

const templates = {
  Marketing: [Storyboard, FourPMarketingMatrix, UserJourneyMap],
  'Project management': [
    GanttChart,
    ProjectTrackingKanban,
    FishboneDiagram,
    ProjectPlanning,
    MonthlyCalendar,
  ],
  Brainstorming: [SWOT, FiveWTwoH, Flowchart, ConceptMap, SMART],
  Presentation: [DataAnalysis, SimplePresentation, BusinessProposal],
};

function lcs(text1: string, text2: string) {
  const dp: number[][] = Array.from({ length: text1.length + 1 })
    .fill(null)
    .map(() => Array.from<number>({ length: text2.length + 1 }).fill(0));

  for (let i = 1; i <= text1.length; i++) {
    for (let j = 1; j <= text2.length; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[text1.length][text2.length];
}

export const builtInTemplates = {
  list: async (category: string) => {
    // @ts-expect-error type should be asserted when using
    return templates[category] ?? [];
  },

  categories: async () => {
    return Object.keys(templates);
  },

  search: async (query: string) => {
    const candidates: unknown[] = [];
    const cates = Object.keys(templates);

    query = query.toLowerCase();

    for (const cate of cates) {
      // @ts-expect-error type should be asserted when using
      const templatesOfCate = templates[cate];

      for (const temp of templatesOfCate) {
        if (lcs(query, temp.name.toLowerCase()) === query.length) {
          candidates.push(temp);
        }
      }
    }

    return candidates;
  },
};
