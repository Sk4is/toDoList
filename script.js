const formulary = document.getElementById("formulary");
const table = document.getElementById("table");

function insertrow(name) {
  const row = document.createElement("tr");

  const cellname = document.createElement("td");
  cellname.textContent = name;

  const cellStatus = document.createElement("td");
  const cellActions = document.createElement("td");

  const deleteButton = document.createElement("button");
  const completeButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  completeButton.textContent = "Complete";

  deleteButton.classList.add("delete-btn");
  completeButton.classList.add("complete-btn");

  completeButton.onclick = function () {
    row.style.backgroundColor = "#1A661D";
  };

  deleteButton.onclick = function () {
    Swal.fire({
      title: 'Are you sure you want to delete this task?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        table.deleteRow(row.rowIndex);
        checkEmptyTable();
        Swal.fire(
          'Deleted!',
          'Your task has been deleted.',
          'success'
        );
      } else if (result.isDismissed) {
        Swal.fire(
          'Cancelled',
          'Your task is safe.',
          'info'
        );
      }
    });
  };

  const statusText = document.createElement("p");
  statusText.textContent = "Pending";
  cellStatus.appendChild(statusText);
  cellActions.appendChild(completeButton);
  cellActions.appendChild(deleteButton);

  row.appendChild(cellname);
  row.appendChild(cellStatus);
  row.appendChild(cellActions);

  table.appendChild(row);

  checkEmptyTable();
}

function checkEmptyTable() {
  const rows = table.rows.length;
  
  if (rows <= 1) {
    const emptyRow = document.getElementById("no-tasks-row");
    if (!emptyRow) {
      const emptyRow = document.createElement("tr");
      emptyRow.setAttribute("id", "no-tasks-row");
      const emptyCell = document.createElement("td");
      emptyCell.setAttribute("colspan", "3");
      emptyCell.style.textAlign = "center";
      emptyCell.textContent = "No task found";
      emptyRow.appendChild(emptyCell);
      table.appendChild(emptyRow);
    }
  } else {
    const emptyRow = document.getElementById("no-tasks-row");
    if (emptyRow) {
      emptyRow.remove();
    }
  }
}

formulary.addEventListener("submit", function (event) {
  event.preventDefault();

  const name = document.getElementById("task").value;
  
  if (name) {
    insertrow(name);
  }

  formulary.reset();
  checkEmptyTable();
});
