import * as d3 from 'd3';

export function buildSvgGraphFor(numbers: number[]): SVGSVGElement | null {
  const width = 928;
  const height = 500;
  const marginTop = 20;
  const marginRight = 30;
  const marginBottom = 30;
  const marginLeft = 40;

  const dataset: [number, number][] = numbers.map((val, ind) => [val, ind]);

  const x = d3.scaleLinear(
    [0, d3.max(dataset, (d) => d[1])!],
    [marginLeft, width - marginRight]
  );

  const y = d3.scaleLinear(
    [
      d3.min(dataset, (d) => d[0])!,
      d3.max(dataset, (d) => d[0])!
    ],
    [height - marginBottom, marginTop]
  );

  const line = d3
    .line<[number, number]>()
    .x((d) => x(d[1]))
    .y((d) => y(d[0]));

  const svg = d3
    .create('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto; height: intrinsic;');

  svg
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', 'red')
    .attr('stroke-width', 10.0)
    .attr('d', line(dataset));

  return svg.node();
}
