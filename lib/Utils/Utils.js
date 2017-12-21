export const getPipelineMatchStage = (pipeline) => {
  if (pipeline) {
    const matchStages = pipeline.filter((stage) => stage.hasOwnProperty('$match'));
    if (matchStages.length) {
      return matchStages[0];
    }
  }
  return false;
};
