/** 教程与单卡全文共用，原文按段落／标题／列表／表格呈现，不注入 HTML。 */
export function ReferenceText({ text }: { text: string }) {
  return (
    <div className="reference-text">
      {text.split(/\n\s*\n/).map((block, index) => {
        const lines = block.trim().split('\n');
        if (lines[0]?.startsWith('|')) {
          const rows = lines
            .filter((line) => !/^[\s|:-]+$/.test(line))
            .map((line) =>
              line
                .trim()
                .replace(/^\||\|$/g, '')
                .split('|')
                .map((cell) => cell.trim()),
            );
          return (
            <div
              className="guide-rule-table"
              tabIndex={0}
              aria-label="规则表格，可横向滚动"
              key={index}
            >
              <table>
                <thead>
                  <tr>
                    {rows[0]?.map((cell, col) => (
                      <th scope="col" key={col}>
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, col) => (
                        <td key={col}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (/^#{1,6}\s/.test(block)) {
          const [heading, ...rest] = lines;
          return (
            <section key={index}>
              <h3>{heading!.replace(/^#{1,6}\s/, '')}</h3>
              {rest.length > 0 && <p>{rest.join('\n')}</p>}
            </section>
          );
        }
        if (lines.every((line) => /^[-*]\s/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, i) => (
                <li key={i}>{line.replace(/^[-*]\s/, '')}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}
