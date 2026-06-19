'use client';
import { useState } from 'react';

const COLUMNS = ['pending', 'in_progress', 'completed', 'overdue'];

export default function TaskKanban({ tasks = [] }: { tasks?: any[] }) {
  // Simple Kanban board prototype
  const [boardTasks, setBoardTasks] = useState(
    tasks.length ? tasks : [
      { id: '1', title: 'Irrigate Block A', status: 'pending', priority: 'high', type: 'Irrigate' },
      { id: '2', title: 'Spray Block B', status: 'in_progress', priority: 'urgent', type: 'Spray' },
      { id: '3', title: 'Fertilize Block C', status: 'completed', priority: 'normal', type: 'Fertilize' },
    ]
  );

  return (
    <div className="flex h-full gap-6 w-full overflow-x-auto min-h-[500px] p-4">
      {COLUMNS.map(col => (
        <div key={col} className="flex-1 bg-gray-100 rounded-lg p-4 min-w-[250px] shadow-inner">
          <h3 className="font-bold mb-4 uppercase text-sm text-gray-700 border-b pb-2">{col.replace('_', ' ')}</h3>
          <div className="flex flex-col gap-3">
            {boardTasks.filter(t => t.status === col).map(task => (
              <div key={task.id} className="bg-white p-3 rounded shadow-sm border border-gray-200 cursor-grab hover:shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-800 rounded">{task.type}</span>
                  {task.priority === 'urgent' && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                </div>
                <h4 className="font-medium text-gray-900">{task.title}</h4>
                <div className="mt-4 flex -space-x-2">
                   <div className="w-6 h-6 bg-gray-300 rounded-full border-2 border-white"></div>
                   <div className="w-6 h-6 bg-gray-400 rounded-full border-2 border-white"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
