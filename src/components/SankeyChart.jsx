import { useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'

const NODE_COLORS = { income: '#22c55e', expense: '#ef4444', savings: '#3b82f6', hub: '#6366f1' }

export default function SankeyChart({ data, width, height }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  const graph = useMemo(() => {
    if (!data || data.nodes.length === 0 || data.links.length === 0) return null

    const nodeIndex = new Map(data.nodes.map((n, i) => [n.id, i]))
    const sankeyGenerator = sankey()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [1, 5],
        [width - 1, height - 5],
      ])

    const input = {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({
        source: nodeIndex.get(l.source),
        target: nodeIndex.get(l.target),
        value: l.value,
      })),
    }

    return sankeyGenerator(input)
  }, [data, width, height])

  if (!graph) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-sm text-gray-400 dark:text-gray-500"
      >
        No data for this period.
      </div>
    )
  }

  const linkPath = sankeyLinkHorizontal()

  function isLinkHighlighted(link) {
    if (!selectedNodeId) return true
    return link.source.id === selectedNodeId || link.target.id === selectedNodeId
  }

  return (
    <svg width={width} height={height}>
      <g>
        {graph.links.map((link, i) => (
          <path
            key={i}
            d={linkPath(link)}
            fill="none"
            stroke={NODE_COLORS[link.source.type] ?? '#94a3b8'}
            strokeOpacity={isLinkHighlighted(link) ? 0.35 : 0.08}
            strokeWidth={Math.max(link.width, 1)}
          />
        ))}
      </g>
      <g>
        {graph.nodes.map((node) => {
          const isSource = node.depth === 0
          const isHub = node.type === 'hub'
          const labelX = isHub ? (node.x0 + node.x1) / 2 : isSource ? node.x0 - 6 : node.x1 + 6
          const textAnchor = isHub ? 'middle' : isSource ? 'end' : 'start'
          return (
            <g key={node.id}>
              <rect
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={Math.max(node.y1 - node.y0, 1)}
                fill={NODE_COLORS[node.type] ?? '#94a3b8'}
                fillOpacity={!selectedNodeId || selectedNodeId === node.id ? 1 : 0.4}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedNodeId((prev) => (prev === node.id ? null : node.id))}
              >
                <title>
                  {node.name}: {node.value.toFixed(2)}
                </title>
              </rect>
              <text
                x={labelX}
                y={isHub ? node.y0 - 8 : (node.y0 + node.y1) / 2}
                dy="0.35em"
                textAnchor={textAnchor}
                className="fill-gray-700 dark:fill-gray-300"
                fontSize={11}
              >
                {node.name}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
