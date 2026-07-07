import { useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'

const HUB_COLOR = '#6366f1'
const TOP_MARGIN = 24
const SIDE_MARGIN = 150
const MAX_LABEL_CHARS = 20

function truncate(name) {
  return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name
}

export default function SankeyChart({ data, width, height }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [hover, setHover] = useState(null) // { x, y, name, value }

  const graph = useMemo(() => {
    if (!data || data.nodes.length === 0 || data.links.length === 0) return null

    const nodeIndex = new Map(data.nodes.map((n, i) => [n.id, i]))
    const sankeyGenerator = sankey()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [SIDE_MARGIN, TOP_MARGIN],
        [width - SIDE_MARGIN, height - 5],
      ])

    const input = {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({
        source: nodeIndex.get(l.source),
        target: nodeIndex.get(l.target),
        value: l.value,
        color: l.color,
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
    <div className="relative text-gray-700 dark:text-gray-300">
      <svg width={width} height={height}>
        <g>
          {graph.links.map((link, i) => (
            <path
              key={i}
              d={linkPath(link)}
              fill="none"
              stroke={link.color ?? HUB_COLOR}
              strokeOpacity={isLinkHighlighted(link) ? 0.35 : 0.08}
              strokeWidth={Math.max(link.width, 1)}
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) =>
                setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, name: `${link.source.name} → ${link.target.name}`, value: link.value })
              }
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </g>
        <g>
          {graph.nodes.map((node) => {
            const isSource = node.depth === 0
            const isHub = node.type === 'hub'
            const labelX = isHub ? (node.x0 + node.x1) / 2 : isSource ? node.x0 - 6 : node.x1 + 6
            const textAnchor = isHub ? 'middle' : isSource ? 'end' : 'start'
            const color = node.color ?? HUB_COLOR
            return (
              <g key={node.id}>
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={node.x1 - node.x0}
                  height={Math.max(node.y1 - node.y0, 1)}
                  fill={color}
                  fillOpacity={!selectedNodeId || selectedNodeId === node.id ? 1 : 0.4}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedNodeId((prev) => (prev === node.id ? null : node.id))}
                  onMouseMove={(e) =>
                    setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, name: node.name, value: node.value })
                  }
                  onMouseLeave={() => setHover(null)}
                />
                <text
                  x={labelX}
                  y={isHub ? node.y0 - 8 : (node.y0 + node.y1) / 2}
                  dy="0.35em"
                  textAnchor={textAnchor}
                  fill="currentColor"
                  fontSize={11}
                >
                  <title>{node.name}</title>
                  {truncate(node.name)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      {hover && (
        <div
          className="absolute bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg border border-gray-700 px-3 py-2 pointer-events-none whitespace-nowrap"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-semibold">{hover.name}</p>
          <p>${hover.value.toFixed(2)}</p>
        </div>
      )}
    </div>
  )
}
